from flask import Flask, render_template, request, jsonify
from flask.json.provider import DefaultJSONProvider
from pathlib import Path
import math
import threading
import pandas as pd

app = Flask(__name__)


class SemNaNJSONProvider(DefaultJSONProvider):
    """Evita NaN no JSON (JSON.parse do navegador rejeita NaN literal)."""

    @staticmethod
    def _sanitizar(obj):
        if isinstance(obj, float) and math.isnan(obj):
            return None
        if isinstance(obj, dict):
            return {k: SemNaNJSONProvider._sanitizar(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [SemNaNJSONProvider._sanitizar(v) for v in obj]
        return obj

    def dumps(self, obj, **kwargs):
        return super().dumps(self._sanitizar(obj), **kwargs)


app.json = SemNaNJSONProvider(app)

BASE_DIR = Path(__file__).resolve().parent
ARQUIVO_PARQUET = BASE_DIR / "data" / "alteracoes_orcamentarias.parquet"
ARQUIVO_PARQUET_NAO_EFETIVADAS = BASE_DIR / "data" / "alteracoes_nao_efetivadas.parquet"

_dfs = {}

# Visões disponíveis no dashboard.
# - "dashboard": painel agregado (top órgãos + heatmap + timeline) sobre Efetivadas.
# - "efetivadas" / "nao_efetivadas": visão "Dados" (tabela) de cada fonte.
VISOES = ("dashboard", "efetivadas", "nao_efetivadas")

# A visão "dashboard" é a timeline social dos registros Efetivados: reutiliza
# o parquet e o mês/data das efetivadas (mas não usa a árvore da tabela).
VISAO_FONTE_DASHBOARD = "efetivadas"

# Mapeamento dos rótulos exibidos no filtro de Classificação
# para os valores reais da coluna.
CLASSIFICACAO_MAP = {
    "Extraordinário": "Crédito Extraordinário",
    "Suplementar": "Crédito Suplementar",
    "Especial": "Crédito Especial",
    "Outras Alterações": "Outras Alterações Orçamentárias",
    "Reabertura": "Reabertura de Crédito",
}


# ======================================================
# LEITURA DO PARQUET
# ======================================================

def _sanitizar_visao(visao):
    return visao if visao in VISOES else "dashboard"


def _arquivo_parquet_para(visao):
    if visao == "nao_efetivadas":
        return ARQUIVO_PARQUET_NAO_EFETIVADAS
    return ARQUIVO_PARQUET


def _coluna_data(visao, df):
    """Coluna de data usada por cada visão:
    - dashboard/efetivadas: Data de Publicação do Instrumento Legal
    - não efetivadas: Data de Criação do Pedido
    Cai para a primeira coluna com 'Data' se a preferida não existir no df."""
    preferida = ("Data de Criação do Pedido"
                 if visao == "nao_efetivadas"
                 else "Data de Publicação do Instrumento Legal")
    if preferida in df.columns:
        return preferida
    candidatas = [c for c in df.columns if "Data" in c]
    return candidatas[0] if candidatas else ""


def _visao_fonte(visao):
    """Visão de dados para leitura do parquet (dashboard reusa efetivadas)."""
    if visao == "dashboard":
        return VISAO_FONTE_DASHBOARD
    return visao


def _otimizar_memoria(df):
    """Reduz o consumo de RAM convertendo colunas de texto com valores
    repetidos para o dtype 'category' (códigos inteiros + tabela de valores
    únicos, em vez de repetir cada string linha a linha)."""
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_string_dtype(s):
            nunique = s.nunique(dropna=True)
            if nunique and nunique < 10000:
                df[c] = s.astype("category")
    return df


def carregar_dados(visao="efetivadas"):
    visao = _sanitizar_visao(visao)
    fonte = _visao_fonte(visao)
    if fonte not in _dfs:
        df = pd.read_parquet(
            _arquivo_parquet_para(fonte), engine="fastparquet"
        )
        _dfs[fonte] = _otimizar_memoria(df)
    return _dfs[fonte]


def obter_data_atualizacao(df, visao="efetivadas"):
    """Data de atualização dos dados = data mais recente (máxima) da coluna de
    datas da visão — dispensa os arquivos meta.json:
    - dashboard/efetivadas: max de 'Data de Publicação do Instrumento Legal'
    - não efetivadas: max de 'Data de Criação do Pedido'
    """
    col = _coluna_data(visao, df)
    if not col or col not in df.columns:
        return ""
    serie = pd.to_datetime(df[col], errors="coerce").dropna()
    if serie.empty:
        return ""
    return serie.max().strftime("%d/%m/%Y")


# ======================================================
# CONSTRUTOR DE TABELA
# ======================================================

COLUNAS_CONSTRUTOR_PADRAO = [
    "Unidade Orçamentária (desc.)",
    "Resultado Primário - Atual",
    "GND",
    "Subtipo Ato",
    "Data de Publicação do Instrumento Legal",
]

# Colunas padrão da tabela construtora dentro da árvore:
# Órgão - UO - RP - GND - Subtipo do Ato (Suplementação/Cancelamento são
# sempre acrescentadas pela interface).
COLUNAS_CONSTRUTOR_PADRAO_ARVORE = [
    "Órgão Sigla",
    "Unidade Orçamentária (desc.)",
    "Resultado Primário - Atual",
    "GND",
    "Subtipo Ato",
]

COLUNAS_CONSTRUTOR_EXCLUIR = {
    "Suplementação",
    "Cancelamento",
    "DOU_link",
    "Órgão (desc.)",
    "104 Bloqueado Contido SOF - Congelado",
    "107 Bloqueado Controle SOF - Congelado",
    "Instrumento Legal (desc.)",
    "Número do Documento",
    "Pedido Alteração",
    "CD_IDFR",
}


def colunas_construtor_padrao_para(visao):
    if visao == "nao_efetivadas":
        return [
            "Unidade Orçamentária (desc.)",
            "Resultado Primário - Atual",
            "GND",
            "Subtipo Ato",
            "Situação (desc.)",
            "Data de Criação do Pedido",
        ]
    return COLUNAS_CONSTRUTOR_PADRAO_ARVORE


def obter_colunas_construtor_disponiveis(df):
    return [
        c for c in df.columns
        if c not in COLUNAS_CONSTRUTOR_EXCLUIR
    ]


def gerar_tabela_construtor(df, colunas):
    if not colunas:
        return []
    colunas = [c for c in colunas if c in df.columns]
    if not colunas:
        return []
    tmp = df.copy()
    for c in colunas:
        if c == "GND":
            # mesmo tratamento dos filtros: apenas o 1º caractere
            tmp[c] = tmp[c].astype("string").str.strip().str[0].fillna("(vazio)").astype(str)
        elif pd.api.types.is_datetime64_any_dtype(tmp[c]):
            tmp[c] = tmp[c].dt.strftime("%d/%m/%Y").fillna("(vazio)").astype(str)
        else:
            tmp[c] = tmp[c].astype("string").str.strip().fillna("(vazio)").astype(str)
        tmp[c] = tmp[c].replace({"nan": "(vazio)", "None": "(vazio)", "NaT": "(vazio)"})
    agrupado = (
        tmp.groupby(colunas, dropna=False, observed=True)
        .agg({"Suplementação": "sum", "Cancelamento": "sum"})
        .reset_index()
    )
    agrupado["saldo"] = agrupado["Suplementação"] - agrupado["Cancelamento"]
    agrupado = agrupado.sort_values(
        ["Suplementação", "Cancelamento"], ascending=[False, False]
    )
    return agrupado.to_dict(orient="records")


# ======================================================
# FILTROS
# ======================================================

def aplicar_filtros(df, filtros):
    filtros_map = {
        "orgao": "Órgão Sigla",
        "tipo_alteracao": "Tipo Alteração (desc.)",
        "exercicio": "Ano Exercício",
        "rps": "Resultado Primário - Atual",
        "classificacao": "Classificação da Alteração (desc.)",
        "financiamento": "Subtipo Ato",
        "iduso": "IDUSO (desc.)",
        "pedido": "Pedido Alteração",
        "gnd": "GND",
        "acao": "Ação (desc.)",
        "localizador": "Localizador (desc.)",
        "uo": "Unidade Orçamentária (desc.)",
    }
    df = df.copy()
    for key, col in filtros_map.items():
        valores = filtros.get(key, [])
        if not valores:
            continue
        if col == "Ano Exercício":
            df = df[df[col].isin([int(v) for v in valores])]
        elif col == "Pedido Alteração":
            df = df[df[col].astype(str).isin(valores)]
        elif col == "GND":
            # Match pelo primeiro caractere
            _gnd_short = df[col].astype(str).str.strip().str[0]
            df = df[_gnd_short.isin(valores)]
        elif col == "IDUSO (desc.)":
            _iduso_short = df[col].astype(str).str.strip().str[0]
            df = df[_iduso_short.isin(valores)]
        elif col == "Classificação da Alteração (desc.)":
            raws = [
                CLASSIFICACAO_MAP[v]
                for v in valores
                if v in CLASSIFICACAO_MAP
            ]
            df = df[df[col].isin(raws)]
        else:
            df = df[df[col].isin(valores)]
    return df


# ======================================================
# CARDS
# ======================================================

def calcular_cards(df):
    total_suplementado = float(df["Suplementação"].sum())
    total_cancelado = float(df["Cancelamento"].sum())
    saldo = total_suplementado - total_cancelado
    qtd_alteracoes = df["Pedido Alteração"].astype(str).str.strip().replace("", pd.NA).dropna().nunique()
    return {
        "suplementacao": round(total_suplementado, 2),
        "cancelamento": round(total_cancelado, 2),
        "saldo": round(saldo, 2),
        "quantidade": int(qtd_alteracoes),
    }


# ======================================================
# TABELA
# ======================================================

def gerar_tabela(df, visao="efetivadas"):
    col = _coluna_data(visao, df)
    if not col:
        return []
    tmp = df.dropna(subset=[col]).copy()
    if len(tmp) == 0:
        return []
    tmp["mes"] = tmp[col].dt.to_period("M")
    agrupado = (
        tmp.groupby("mes")
        .agg({"Suplementação": "sum", "Cancelamento": "sum"})
        .reset_index()
        .sort_values("mes")
    )
    agrupado["saldo"] = agrupado["Suplementação"] - agrupado["Cancelamento"]
    agrupado["mes_str"] = agrupado["mes"].dt.strftime("%m/%Y")
    return agrupado[["mes_str", "Suplementação", "Cancelamento", "saldo"]].rename(
        columns={
            "mes_str": "meses",
            "Suplementação": "suplementacao",
            "Cancelamento": "cancelamento",
            "saldo": "saldo",
        }
    ).to_dict(orient="records")


# ======================================================
# DETALHES POR MÊS
# ======================================================

def _formatar_datas(serie, formato):
    """Aplica strftime sobre apenas os valores únicos e mapeia de volta —
    muito mais rápido que .dt.strftime linha a linha em bases grandes."""
    unicos = serie.dropna().unique()
    mapeamento = dict(
        zip(unicos, pd.DatetimeIndex(unicos).strftime(formato))
    )
    return serie.map(mapeamento)


def gerar_detalhes(df, visao="efetivadas"):
    col = _coluna_data(visao, df)
    if not col:
        return {}
    tmp = df.dropna(subset=[col]).copy()
    if len(tmp) == 0:
        return {}
    tmp["mes"] = _formatar_datas(tmp[col], "%m/%Y")

    # Não efetivadas: árvore de nível único (mês) — expandir o mês já abre o
    # construtor com os dados relativos àquele mês (sem nível de instrumento).
    if visao == "nao_efetivadas":
        meses = sorted(tmp["mes"].unique().tolist())
        return {m: [{"_nao_efetivadas": True, "mes": m}] for m in meses}

    # Efetivadas: árvore com 3 níveis (mês → instrumento → registros).
    # Cada grupo de instrumento já vem com totais de Suplementação/Cancelamento
    # e a lista de órgãos, para preencher as linhas na tabela unificada.
    inst_col = "Instrumento_Num"
    link_col = "DOU_link"
    org_col = "Órgão Sigla"
    if not all(c in df.columns for c in [inst_col, org_col]):
        return {}
    tmp = tmp[tmp[inst_col].astype(str).str.strip().ne("")]
    if len(tmp) == 0:
        return {}
    tmp["data_fmt"] = _formatar_datas(tmp[col], "%d/%m/%Y")
    chaves = ["mes", "data_fmt", inst_col]
    agrupado = (
        tmp.groupby(chaves, dropna=False, observed=True)
        .agg(
            suplementacao=("Suplementação", "sum"),
            cancelamento=("Cancelamento", "sum"),
            DOU_link=(link_col, "first"),
        )
        .reset_index()
    )
    agrupado["saldo"] = agrupado["suplementacao"] - agrupado["cancelamento"]
    orgaos_series = tmp[org_col].astype("string")
    orgaos = (
        tmp.assign(**{org_col: orgaos_series})
        .groupby(chaves, dropna=False, observed=True)[org_col]
        .agg(lambda s: sorted(s.dropna().unique().tolist()))
        .rename("orgaos")
        .reset_index()
    )
    agrupado = agrupado.merge(orgaos, on=chaves, how="left")
    agrupado = agrupado.sort_values(["mes", "data_fmt"])
    detalhes = {
        m: g.to_dict(orient="records")
        for m, g in agrupado.groupby("mes", dropna=False)
    }
    return detalhes


# ======================================================
# JORNAL — TIMELINE DE PUBLICAÇÕES (cards sociais)
# ======================================================

def gerar_jornal(df):
    """Cards da visão Dashboard — cada publicação (instrumento legal) vira um card
    com favorecidos (órgãos que tiveram Suplementação, com soma por órgão) e
    contrapartes (órgãos que tiveram Cancelamento, com soma por órgão), além
    dos totais. Ordenado por data real decrescente."""
    col = "Data de Publicação do Instrumento Legal"
    inst_col = "Instrumento_Num"
    org_col = "Órgão Sigla"
    if not all(c in df.columns for c in [col, inst_col, org_col]):
        return []
    tmp = df.dropna(subset=[col]).copy()
    tmp[inst_col] = tmp[inst_col].astype(str).str.strip()
    tmp = tmp[tmp[inst_col].ne("")]
    if len(tmp) == 0:
        return []

    chaves = [col, inst_col]
    agrupado = (
        tmp.groupby(chaves, dropna=False, observed=True)
        .agg(
            suplementacao=("Suplementação", "sum"),
            cancelamento=("Cancelamento", "sum"),
        )
        .reset_index()
    )
    for col_meta, campo in (
        ("Subtipo Ato", "subtipo_ato"),
        ("Instrumento Legal (desc.)", "instrumento_desc"),
        ("DOU_link", "dou_link"),
    ):
        if col_meta not in tmp.columns:
            continue
        extras = (
            tmp.groupby(chaves, dropna=False, observed=True)[col_meta]
            .first()
            .reset_index()
            .rename(columns={col_meta: campo})
        )
        agrupado = agrupado.merge(extras, on=chaves, how="left")
        agrupado[campo] = (
            agrupado[campo].apply(lambda v: "" if v is None else str(v))
        )
    for campo in ("subtipo_ato", "instrumento_desc", "dou_link"):
        if campo not in agrupado.columns:
            agrupado[campo] = ""

    por_org = (
        tmp.assign(**{org_col: tmp[org_col].astype("string").fillna("").astype(str)})
        .groupby(chaves + [org_col], dropna=False, observed=True)
        .agg(
            suplementacao=("Suplementação", "sum"),
            cancelamento=("Cancelamento", "sum"),
        )
        .reset_index()
    )
    fav_map = {}
    con_map = {}
    por_org = por_org.reset_index(drop=True)
    for data, instru, org, soma_sup, soma_can in zip(
        por_org[col], por_org[inst_col], por_org[org_col],
        por_org["suplementacao"], por_org["cancelamento"],
    ):
        chave = (data, instru)
        if soma_sup != 0:
            fav_map.setdefault(chave, []).append(
                {"orgao": org, "valor": float(soma_sup)}
            )
        if soma_can != 0:
            con_map.setdefault(chave, []).append(
                {"orgao": org, "valor": float(soma_can)}
            )

    registros = []
    agrupado = agrupado.reset_index(drop=True)
    for data, instru, sup, can, sub, desc, dou in zip(
        agrupado[col], agrupado[inst_col],
        agrupado["suplementacao"], agrupado["cancelamento"],
        agrupado["subtipo_ato"], agrupado["instrumento_desc"],
        agrupado["dou_link"],
    ):
        chave = (data, instru)
        registros.append({
            "mes": data.strftime("%m/%Y"),
            "data_fmt": data.strftime("%d/%m/%Y"),
            "instrumento_num": instru,
            "instrumento_desc": desc,
            "dou_link": dou,
            "subtipo_ato": sub,
            "total_suplementado": float(sup),
            "total_cancelado": float(can),
            "favorecidos": fav_map.get(chave, []),
            "contrapartes": con_map.get(chave, []),
        })

    from datetime import datetime as _dt
    def _chave_dt(r):
        try:
            return _dt.strptime(r["data_fmt"], "%d/%m/%Y")
        except (ValueError, TypeError):
            return _dt.min
    registros.sort(key=_chave_dt, reverse=True)
    return registros


def gerar_top_orgaos(df, n=5):
    """Top N órgãos por SALDO líquido (Suplementação − Cancelamento).
    Exclui os órgãos de exceção ('Dívida', 'Operações', ...)."""
    org_col = "Órgão Sigla"
    if org_col not in df.columns:
        return []
    tmp = df.copy()
    tmp[org_col] = tmp[org_col].astype(str).fillna("(vazio)")
    excluidos = {"DÍVIDA", "OPERAÇÕES", "ENCARGOS", "TRANSF.", "RESERVAS"}
    tmp = tmp[~tmp[org_col].astype(str).str.upper().str.strip().isin(excluidos)]
    if tmp.empty:
        return []
    agrupado = tmp.groupby(org_col, dropna=False, observed=True).agg(
        suplementacao=("Suplementação", "sum"),
        cancelamento=("Cancelamento", "sum"),
    ).reset_index()
    agrupado["saldo"] = agrupado["suplementacao"] - agrupado["cancelamento"]
    agrupado = agrupado.sort_values("saldo", ascending=False).head(n)
    return agrupado[[org_col, "suplementacao", "cancelamento", "saldo"]].rename(
        columns={org_col: "orgao"}
    ).to_dict(orient="records")


def gerar_heatmap_mes(df):
    """Dados mensais para o heatmap: totais sup/can e distinct count de pedidos."""
    col = "Data de Publicação do Instrumento Legal"
    ped_col = "Pedido Alteração"
    if col not in df.columns:
        return []
    tmp = df.dropna(subset=[col]).copy()
    if len(tmp) == 0:
        return []
    tmp["mes"] = tmp[col].dt.to_period("M")
    agrupado = (
        tmp.groupby("mes")
        .agg(
            suplementacao=("Suplementação", "sum"),
            cancelamento=("Cancelamento", "sum"),
            distinct_pedidos=(ped_col, "nunique"),
        )
        .reset_index()
        .sort_values("mes")
    )
    agrupado["mes_str"] = agrupado["mes"].dt.strftime("%m/%Y")
    return agrupado[["mes_str", "suplementacao", "cancelamento", "distinct_pedidos"]].rename(
        columns={"mes_str": "mes"}
    ).to_dict(orient="records")


# ======================================================
# COMBOS DOS FILTROS
# ======================================================

def obter_filtros(df):
    # GND: apenas o primeiro caractere
    gnd_col = "GND"
    df = df.copy()
    df["_gnd_short"] = df[gnd_col].astype(str).str.strip().str[0]
    df["_iduso_short"] = df["IDUSO (desc.)"].astype(str).str.strip().str[0]
    return {
        "orgaos": sorted(
            df["Órgão Sigla"].dropna().unique().tolist()
        ),
        "tipos_alteracao": sorted(
            df["Tipo Alteração (desc.)"].dropna().unique().tolist()
        ),
        "exercicios": sorted(
            df["Ano Exercício"].dropna().unique().tolist()
        ),
        "rps": sorted(
            df["Resultado Primário - Atual"].dropna().unique().tolist()
        ),
        "classificacoes": [
            label
            for label, raw in CLASSIFICACAO_MAP.items()
            if raw in set(
                df["Classificação da Alteração (desc.)"].dropna().unique().tolist()
            )
        ],
        "financiamentos": sorted(
            df["Subtipo Ato"].astype(str).str.strip().replace("", pd.NA).dropna().unique().tolist()
        ),
        "idusos": sorted(
            df["_iduso_short"].dropna().unique().tolist()
        ),
        "pedidos": sorted(
            df["Pedido Alteração"].dropna().astype(str).unique().tolist()
        ),
        "gnds": sorted(
            df["_gnd_short"].dropna().unique().tolist()
        ),
        "acoes": sorted(
            df["Ação (desc.)"].dropna().unique().tolist()
        ),
        "localizadores": sorted(
            df["Localizador (desc.)"].dropna().unique().tolist()
        ),
        "uos": sorted(
            df["Unidade Orçamentária (desc.)"].dropna().unique().tolist()
        ),
    }


# ======================================================
# PÁGINA PRINCIPAL
# ======================================================

_templates_cache = {}


def _payload_visao(visao):
    """Dados SSR da visão (sem filtros), cacheados por visão. O GET / passa
    a responder usando o cache em vez de recomputar todas as agregações."""
    if visao not in _templates_cache:
        df = carregar_dados(visao)
        _templates_cache[visao] = {
            "filtros": obter_filtros(df),
            "cards": calcular_cards(df),
            "tabela": gerar_tabela(df, visao),
            "detalhes": gerar_detalhes(df, visao),
            "jornal": gerar_jornal(df),
            "top_orgaos": gerar_top_orgaos(df),
            "heatmap_mes": gerar_heatmap_mes(df),
            "colunas_construtor_disponiveis": obter_colunas_construtor_disponiveis(df),
            "data_geracao": obter_data_atualizacao(df, visao),
        }
    return _templates_cache[visao]


def _aquecer_cache():
    """Pré-computa o cache em segundo plano no boot, para a primeira
    checagem de saúde do Render não depender do processamento completo."""
    try:
        for v in VISOES:
            _payload_visao(v)
    except Exception:
        pass


def _iniciar_aquecimento():
    threading.Thread(target=_aquecer_cache, daemon=True).start()


@app.route("/")
def index():
    visao = _sanitizar_visao(request.args.get("visao", "dashboard"))
    payload = _payload_visao(visao)
    return render_template(
        "alteracoes.html",
        visao=visao,
        colunas_construtor_padrao=colunas_construtor_padrao_para(visao),
        tabela_construtor=[],
        **payload,
    )


# ======================================================
# API AJAX
# ======================================================

@app.route("/dados", methods=["POST"])
def dados():
    payload = request.get_json() or {}
    visao = _sanitizar_visao(payload.get("visao", "efetivadas"))
    filtros = payload.get("filtros", payload)
    if not filtros:
        p = _payload_visao(visao)
        return jsonify({
            "cards": p["cards"],
            "tabela": p["tabela"],
            "detalhes": p["detalhes"],
            "jornal": p["jornal"],
            "top_orgaos": p["top_orgaos"],
            "heatmap_mes": p["heatmap_mes"],
            "tabela_construtor": [],
        })
    df = carregar_dados(visao)
    df = aplicar_filtros(df, filtros)
    detalhes = gerar_detalhes(df, visao)
    return jsonify({
        "cards": calcular_cards(df),
        "tabela": gerar_tabela(df, visao),
        "detalhes": detalhes,
        "jornal": gerar_jornal(df),
        "top_orgaos": gerar_top_orgaos(df),
        "heatmap_mes": gerar_heatmap_mes(df),
        "tabela_construtor": [],
    })


@app.route("/api/filtros-disponiveis", methods=["POST"])
def filtros_disponiveis():
    current_filtros = request.get_json() or {}
    visao = _sanitizar_visao(current_filtros.get("visao", "efetivadas"))
    df = carregar_dados(visao)
    # Para cada filtro: NÃO auto-filtrar, senão o próprio dropdown some
    chave_map = {
        "orgaos": "orgao",
        "tipos_alteracao": "tipo_alteracao",
        "exercicios": "exercicio",
        "rps": "rps",
        "classificacoes": "classificacao",
        "financiamentos": "financiamento",
        "idusos": "iduso",
        "gnds": "gnd",
        "pedidos": "pedido",
        "acoes": "acao",
        "uos": "uo",
        "localizadores": "localizador",
    }
    resultado = {}
    for chave_resp, chave_filtro in chave_map.items():
        # Aplica todos os filtros EXCETO o próprio
        filtros_exc = {k: v for k, v in current_filtros.items() if k != chave_filtro}
        df_tmp = aplicar_filtros(df, filtros_exc)
        # Extrai valores disponíveis para esta coluna
        col_map = {
            "orgaos": "Órgão Sigla",
            "tipos_alteracao": "Tipo Alteração (desc.)",
            "exercicios": "Ano Exercício",
            "rps": "Resultado Primário - Atual",
            "classificacoes": "Classificação da Alteração (desc.)",
            "financiamentos": "Subtipo Ato",
            "idusos": "IDUSO (desc.)",
            "gnds": "GND",
            "pedidos": "Pedido Alteração",
            "acoes": "Ação (desc.)",
            "uos": "Unidade Orçamentária (desc.)",
            "localizadores": "Localizador (desc.)",
        }
        col = col_map[chave_resp]
        if chave_resp == "gnds":
            # GND: apenas primeiro caractere
            vals = sorted(df_tmp[col].astype(str).str.strip().str[0].dropna().unique().tolist())
        elif chave_resp == "idusos":
            # IDUSO: apenas primeiro caractere
            vals = sorted(df_tmp[col].astype(str).str.strip().str[0].dropna().unique().tolist())
        elif col == "Ano Exercício":
            vals = sorted(df_tmp[col].dropna().unique().tolist())
        elif col == "Pedido Alteração":
            vals = sorted(df_tmp[col].dropna().astype(str).unique().tolist())
        elif chave_resp == "classificacoes":
            raws = set(df_tmp[col].dropna().unique().tolist())
            vals = [
                label for label, raw in CLASSIFICACAO_MAP.items()
                if raw in raws
            ]
        else:
            vals = sorted(df_tmp[col].dropna().unique().tolist())
        resultado[chave_resp] = vals
    return jsonify(resultado)


# ======================================================
# API: TABELA CONSTRUTORA DE UM INSTRUMENTO (dentro da árvore)
# ======================================================

@app.route("/api/detalhe-construtor", methods=["POST"])
def detalhe_construtor():
    """Retorna os registros agrupados (colunas do construtor) e o total
    de Suplementação/Cancelamento para um instrumento da árvore."""
    payload = request.get_json() or {}
    visao = _sanitizar_visao(payload.get("visao", "efetivadas"))
    filtros = payload.get("filtros", {})
    data_fmt = payload.get("data_fmt")
    instrumento_num = payload.get("instrumento_num")
    colunas = payload.get("colunas")
    if not colunas:
        colunas = COLUNAS_CONSTRUTOR_PADRAO_ARVORE

    df = carregar_dados(visao)
    df = aplicar_filtros(df, filtros)

    col = _coluna_data(visao, df)
    if not col:
        return jsonify({"registros": [], "total": _total_vazio()})

    if visao == "nao_efetivadas":
        # Árvore de nível único (mês): filtra apenas pelo mês em "MM/AAAA".
        if data_fmt:
            df = df[df[col].dt.strftime("%m/%Y") == data_fmt]
    else:
        if data_fmt:
            df = df[df[col].dt.strftime("%d/%m/%Y") == data_fmt]
        if instrumento_num is not None:
            df = df[df["Instrumento_Num"].astype(str).str.strip() == str(instrumento_num)]

    registros = gerar_tabela_construtor(df, colunas)
    total = {
        "suplementacao": float(df["Suplementação"].sum()),
        "cancelamento": float(df["Cancelamento"].sum()),
        "saldo": float(df["Suplementação"].sum() - df["Cancelamento"].sum()),
    }
    return jsonify({"registros": registros, "total": total})


def _total_vazio():
    return {"suplementacao": 0.0, "cancelamento": 0.0, "saldo": 0.0}


# Pré-computa os dados das visões em background no boot, para que a
# primeira checagem de saúde do Render encontre o cache pronto.
_iniciar_aquecimento()


# ======================================================
# EXECUÇÃO
# ======================================================

if __name__ == "__main__":
    import os

    app.run(
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
    )