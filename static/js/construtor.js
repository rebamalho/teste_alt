/*
==========================================================
CONSTRUTOR DA TABELA UNIFICADA
Colunas configuráveis da árvore única do
"Detalhamento das Alterações" (add/remover colunas).
==========================================================
*/

// Colunas padrão da árvore: Órgão - UO - RP - GND - Subtipo do Ato.
// Suplementação/Cancelamento/Saldo são sempre exibidas ao final.
const COLUNAS_CONSTRUTOR_ARVORE = [
    "Órgão Sigla",
    "Unidade Orçamentária (desc.)",
    "Resultado Primário - Atual",
    "GND",
    "Subtipo Ato"
];

const LABELS_CONSTRUTOR = {
    "Órgão Sigla": "Órgão",
    "Unidade Orçamentária (desc.)": "Unidade Orçamentária",
    "Classificação da Alteração (desc.)": "Classificação",
    "Resultado Primário - Atual": "RP",
    "GND": "GND",
    "Subtipo Ato": "Subtipo do Ato",
    "Ano Exercício": "Ano Exercício",
    "Pedido Alteração": "Pedido Alteração",
    "Data de Publicação do Instrumento Legal": "Data de Publicação",
    "Instrumento Legal (desc.)": "Instrumento Legal",
    "Número do Documento": "Nº Documento",
    "Tipo Alteração (desc.)": "Tipo Alteração",
    "Órgão (desc.)": "Órgão Cód",
    "Ação (desc.)": "Ação",
    "Localizador (desc.)": "Localizador",
    "Plano Orçamentário (desc.)": "Plano Orçamentário",
    "Tipo Financiamento (desc.)": "Tipo Financiamento",
    "IDUSO (desc.)": "IDUSO",
    "104 Bloqueado Contido SOF - Congelado": "104 Bloqueado Contido SOF",
    "107 Bloqueado Controle SOF - Congelado": "107 Bloqueado Controle SOF",
    "Instrumento_Num": "Instrumento",
    "DOU_link": "Link DOU",
    "Situação (desc.)": "Situação",
    "Data de Criação do Pedido": "Data de Criação"
};

function rotuloColuna(col) {
    if (col === SALDO_COLUNA) return "Saldo";
    return LABELS_CONSTRUTOR[col] || col;
}

function chaveOrdenacaoConstrutor(col) {
    return col === SALDO_COLUNA ? "saldo" : col;
}

function chaveDadosColuna(col) {
    return col === SALDO_COLUNA ? "saldo" : col;
}

function colunasConstrutorAtivas() {
    return construtorColunas || [];
}

const SALDO_COLUNA = "__SALDO__";
let mostrarSaldoConstrutor = true;
let colunaArrastada = null;
let ordemConstrutor = [];
// Contexto (data/instrumento/mês) do nó da árvore atualmente aberto.
// Usado para re-buscar os registros quando as colunas são alteradas.
let arvoreContexto = null;

/*
==========================================================
ORDENAÇÃO DA TABELA
==========================================================
*/

let sortConstrutor = { col: null, dir: 1 };

function valorNumericoConstrutor(v) {
    if (v == null || String(v).trim() === "") return null;
    const n = Number(String(v));
    return isNaN(n) ? null : n;
}

function colEhNumericoConstrutor(dados, col) {
    const amostra = dados
        .slice(0, 50)
        .map(r => r[col])
        .filter(v => v != null && String(v).trim() !== "");
    if (amostra.length === 0) return false;
    return amostra.every(v => !isNaN(Number(String(v))));
}

function ordenarDadosConstrutor(dados, col, dir) {
    const numerico = colEhNumericoConstrutor(dados, col);
    const arr = [...dados];
    arr.sort((a, b) => {
        if (numerico) {
            const na = valorNumericoConstrutor(a[col]);
            const nb = valorNumericoConstrutor(b[col]);
            const ra = na === null ? -Infinity : na;
            const rb = nb === null ? -Infinity : nb;
            return (ra - rb) * dir;
        }
        const sa = String(a[col] == null ? "" : a[col]);
        const sb = String(b[col] == null ? "" : b[col]);
        return sa.localeCompare(sb, "pt-BR") * dir;
    });
    return arr;
}

function indicadorOrdenacaoConstrutor(col) {
    if (sortConstrutor.col !== col) return "";
    return sortConstrutor.dir === 1 ? " ▲" : " ▼";
}

function ordenarConstrutor(col, dir) {
    sortConstrutor = { col, dir };
    linhasConstrutor = ordenarDadosConstrutor(linhasConstrutor, col, dir);
    renderizarTabelaConstrutor(linhasConstrutor);
}

/*
==========================================================
CABEÇALHO DA TABELA UNIFICADA
[Detalhamento] + [colunas configuráveis] + [Supl/Cancel/Saldo]
==========================================================
*/

function construirCabecalhoUnico() {
    const thead = document.getElementById("tabelaHead");
    if (!thead) return;

    // thead único: [Detalhamento] + [área configurável (span quando nenhum nó
    // aberto OU quando o nó aberto carrega seu próprio header congelado)] +
    // [Supl/Canc/Saldo (fixas à direita)]. As colunas configuráveis aparecem
    // como linha congelada DENTRO do nó expandido (construirCabecalhoConfig),
    // não no thead. Todas as linhas compartilham o mesmíssimo nº de colunas
    // (com a área configurável em colspan) para manter a escala alinhada.
    const k = totalColunasTabela() - 4; // nº de colunas configuráveis (0 = resumo)

    let html = "<tr><th>Detalhamento</th>";
    if (k > 0) {
        html += '<th colspan="' + k + '" class="config-span"></th>';
    }
    html += '<th>Suplementação</th>';
    html += '<th>Cancelamento</th>';
    html += '<th>Saldo</th>';
    html += "</tr>";

    thead.innerHTML = html;
    thead.onclick = null;
    thead.ondragstart = null;
    thead.ondragover = null;
    thead.ondrop = null;
    thead.ondragend = null;
}

// Monta a LINHA-CABEÇALHO CONGELADA do nó expandido. Fica logo abaixo da linha
// do nó (ref) e acima dos registros, colada ao topo (abaixo do thead) enquanto
// o usuário rola pela faixa de registros. Contém as colunas configuráveis
// (com ordenação, filtro e arrastar-para-reordenar) + Supl/Canc/Saldo.
function construirCabecalhoConfig(ref) {
    const colunas = colunasConstrutorAtivas();
    const theadEl = document.getElementById("tabelaHead");

    let tr = document.createElement("tr");
    tr.className = "frozen-construtor-header";

    let html = '<td class="detalhe-label-cell"></td>';
    colunas.forEach(col => {
        const chave = chaveDadosColuna(col);
        const temFiltro = filtrosConstrutor[chave] && filtrosConstrutor[chave].size > 0;
        html += '<th draggable="true" data-ci="' + escHtml(col) + '" data-sort="' + escHtml(col) + '">'
            + '<span class="col-label">' + rotuloColuna(col) + indicadorOrdenacaoConstrutor(chaveOrdenacaoConstrutor(col)) + "</span>"
            + '<button type="button" class="col-filter' + (temFiltro ? " active" : "") + '" data-col="' + escHtml(chave) + '" title="Filtrar">'
            + '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12">'
            + '<path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
            + "</svg></button>"
            + "</th>";
    });
    html += '<th data-sort="Suplementação">Suplementação' + indicadorOrdenacaoConstrutor("Suplementação") + "</th>";
    html += '<th data-sort="Cancelamento">Cancelamento' + indicadorOrdenacaoConstrutor("Cancelamento") + "</th>";
    html += '<th data-sort="saldo">Saldo' + indicadorOrdenacaoConstrutor("saldo") + "</th>";
    tr.innerHTML = html;

    // Fixa a linha logo abaixo do thead (que já é sticky em top:0).
    if (theadEl && theadEl.offsetHeight > 0) {
        tr.style.top = theadEl.offsetHeight + "px";
    }

    tr.addEventListener("click", e => {
        const btnFiltro = e.target.closest(".col-filter");
        if (btnFiltro) {
            e.stopPropagation();
            togglePopupFiltro(btnFiltro.dataset.col, btnFiltro);
            return;
        }
        const th = e.target.closest("th");
        if (!th) return;
        const chave = th.dataset.sort;
        if (!chave) return;
        const dir = (sortConstrutor.col === chave && sortConstrutor.dir === 1) ? -1 : 1;
        ordenarConstrutor(chave, dir);
    });

    wireDragCabecalhoUnico(tr);
    ref.after(tr);
    return tr;
}

function wireDragCabecalhoUnico(thead) {
    thead.ondragstart = e => {
        const th = e.target.closest("th");
        if (!th || th.dataset.ci == null) return;
        colunaArrastada = th.dataset.ci;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", th.dataset.ci);
            } catch (err) { }
        }
        th.classList.add("dragging");
    };

    thead.ondragover = e => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const th = e.target.closest("th");
        thead.querySelectorAll("th").forEach(t => t.classList.remove("drag-over"));
        if (th) th.classList.add("drag-over");
    };

    thead.ondrop = e => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        thead.querySelectorAll("th").forEach(t => t.classList.remove("drag-over"));
        if (colunaArrastada == null) return;
        const th = e.target.closest("th");
        if (!th || th.dataset.ci == null) return;
        const cols = construtorColunas.slice();
        const idxOrig = cols.indexOf(colunaArrastada);
        const idxAlvo = cols.indexOf(th.dataset.ci);
        if (idxOrig === -1 || idxAlvo === -1 || idxOrig === idxAlvo) return;

        const novaOrdem = cols.filter(c => c !== colunaArrastada);
        let pos = novaOrdem.indexOf(th.dataset.ci);
        if (idxAlvo > idxOrig) pos += 1;
        novaOrdem.splice(pos, 0, colunaArrastada);

        construtorColunas = novaOrdem;
        aplicarMudancaColunas();
    };

    thead.ondragend = () => {
        colunaArrastada = null;
        thead.querySelectorAll("th").forEach(t => t.classList.remove("dragging", "drag-over"));
    };
}

/*
==========================================================
PAINEL DO CONSTRUTOR (dropdown + busca)
==========================================================
*/

function sincronizarConstrutorColunas() {
    ordemConstrutor = construtorColunas.filter(
        c => c !== "Suplementação" && c !== "Cancelamento" && c !== SALDO_COLUNA
    ).concat(["Suplementação", "Cancelamento", SALDO_COLUNA]);
}

function initConstrutor() {
    const picker = document.getElementById("construtorPicker");
    if (!picker) return;

    const btn = document.getElementById("construtorBtn");
    const panel = document.getElementById("construtorPanel");
    const search = document.getElementById("construtorSearch");
    const optionsWrap = document.getElementById("construtorOptions");

    btn.addEventListener("click", e => {
        e.stopPropagation();
        panel.classList.toggle("open");
    });

    document.addEventListener("click", e => {
        if (!picker.contains(e.target)) panel.classList.remove("open");
    });

    search.addEventListener("input", renderizarOpcoesConstrutor);

    optionsWrap.addEventListener("change", e => {
        if (e.target.type !== "checkbox") return;
        const col = e.target.value;
        if (col === SALDO_COLUNA) return;
        if (e.target.checked) {
            if (!construtorColunas.includes(col)) construtorColunas.push(col);
        } else {
            construtorColunas = construtorColunas.filter(c => c !== col);
            delete filtrosConstrutor[col];
        }
        sincronizarConstrutorColunas();
        // Re-renderiza a árvore (thead + linhas) preservando o nó aberto.
        aplicarMudancaColunas();
    });

    sincronizarConstrutorColunas();

    document.addEventListener("click", e => {
        if (!filtroPopup || !filtroPopup.classList.contains("open")) return;
        if (e.target.closest(".construtor-filter-popup") || e.target.closest(".col-filter")) return;
        fecharPopupFiltro();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") fecharPopupFiltro();
    });

    window.addEventListener("resize", fecharPopupFiltro);
    window.addEventListener("scroll", e => {
        if (!filtroPopup || !filtroPopup.classList.contains("open")) return;
        // Scroll originado dentro do popup (rolar a lista de valores) não fecha.
        if (e.target && filtroPopup.contains(e.target)) return;
        fecharPopupFiltro();
    }, true);

    renderizarOpcoesConstrutor();
    atualizarTabelaConstrutor(tabelaConstrutorInicial);
}

function renderizarOpcoesConstrutor() {
    const optionsWrap = document.getElementById("construtorOptions");
    if (!optionsWrap) return;
    const q = (document.getElementById("construtorSearch").value || "").toLowerCase();
    optionsWrap.innerHTML = "";
    colunasConstrutorDisponiveis.forEach(col => {
        if (!rotuloColuna(col).toLowerCase().includes(q)) return;
        const label = document.createElement("label");
        label.className = "ms-option";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = col;
        cb.checked = construtorColunas.includes(col);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + rotuloColuna(col)));
        optionsWrap.appendChild(label);
    });
}

/*
==========================================================
RENDERIZAÇÃO DOS REGISTROS (nível 3) NO TBODY ÚNICO
==========================================================
*/

let linhasConstrutor = [];
let totaisConstrutor = null;

function renderizarTabelaConstrutor(dados) {
    const tbody = document.getElementById("tabelaBody");

    linhasConstrutor = Array.isArray(dados) ? dados : [];

    if (!tbody) return;

    tbody.querySelectorAll(".frozen-construtor-header, .row-registro, .tree-total-row").forEach(r => r.remove());

    const ref = arvoreContexto && arvoreContexto.linha && arvoreContexto.linha.parentNode === tbody
        ? arvoreContexto.linha
        : null;
    if (!ref) return;

    const colunas = colunasConstrutorAtivas();
    const ncol = 1 + colunas.length + 3;

    if (linhasConstrutor.length === 0) {
        const tr = document.createElement("tr");
        tr.className = "row-registro";
        tr.innerHTML = '<td colspan="' + ncol + '" class="empty-table">Nenhum registro encontrado.</td>';
        ref.after(tr);
        return;
    }

    // Os registros usam o mesmo total de colunas do thead (Detalhamento +
    // colunas configuráveis + Supl/Canc/Saldo), garantindo o alinhamento/escala
    // com a árvore. A linha-cabeçalho congelada (com as colunas configuráveis)
    // é inserida logo após o nó e acima dos registros.
    let anchor = construirCabecalhoConfig(ref);

    linhasConstrutor.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "row-registro";
        let html = "<td></td>";
        colunas.forEach(c => {
            html += "<td>" + escHtml(item[c] == null ? "" : item[c]) + "</td>";
        });
        tr.innerHTML = html
            + '<td class="numeric">' + formatarMoeda(item.Suplementação || 0) + "</td>"
            + '<td class="numeric">' + formatarMoeda(item.Cancelamento || 0) + "</td>"
            + '<td class="numeric">' + formatarMoeda(item.saldo || 0) + "</td>";
        anchor.after(tr);
        anchor = tr;
    });

    if (totaisConstrutor) {
        const tr = document.createElement("tr");
        tr.className = "row-total tree-total-row";
        let html = '<td class="detalhe-label-cell"><span class="toggle-icon">∑</span> Total</td>';
        colunas.forEach(() => {
            html += "<td></td>";
        });
        tr.innerHTML = html
            + '<td class="numeric">' + formatarMoeda(totaisConstrutor.suplementacao || 0) + "</td>"
            + '<td class="numeric">' + formatarMoeda(totaisConstrutor.cancelamento || 0) + "</td>"
            + '<td class="numeric">' + formatarMoeda(totaisConstrutor.saldo || 0) + "</td>";
        anchor.after(tr);
    }
}

function atualizarTabelaConstrutor(dados) {
    dadosBaseConstrutor = Array.isArray(dados) ? dados : [];
    reaplicarFiltrosConstrutor();
}

/*
==========================================================
CARREGAMENTO DOS REGISTROS DO NÓ ABERTO
==========================================================
*/

async function carregarRegistrosConstrutor() {
    atualizarBotaoLimparFiltros();
    renderizarOpcoesConstrutor();

    if (!arvoreContexto) return;

    const filtros = typeof obterFiltros === "function" ? obterFiltros() : {};
    const corpo = {
        visao: visaoAtual,
        filtros,
        data_fmt: arvoreContexto.data_fmt,
        instrumento_num: arvoreContexto.instrumento_num,
        colunas: construtorColunas
    };
    try {
        const resp = await fetch("/api/detalhe-construtor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo)
        });
        if (!resp.ok) throw new Error("erro");
        const dados = await resp.json();
        totaisConstrutor = dados.total || null;
        atualizarTabelaConstrutor(dados.registros || []);
    } catch (erro) {
        console.error("Erro ao carregar registros da árvore:", erro);
        totaisConstrutor = null;
        atualizarTabelaConstrutor([]);
    }
}

/*
==========================================================
FILTROS DE COLUNA (estilo Excel)
==========================================================
*/

let filtrosConstrutor = {};
let dadosBaseConstrutor = [];
let filtroPopup = null;
let filtroAbertoCol = null;

function aplicarFiltrosConstrutor(dados) {
    if (!Array.isArray(dados) || dados.length === 0) return dados || [];
    const chaves = Object.keys(filtrosConstrutor);
    if (chaves.length === 0) return dados;
    return dados.filter(item => {
        return chaves.every(chave => {
            const permitidos = filtrosConstrutor[chave];
            if (!permitidos || permitidos.size === 0) return true;
            return permitidos.has(item[chave] == null ? "" : String(item[chave]));
        });
    });
}

function reaplicarFiltrosConstrutor() {
    atualizarBotaoLimparFiltros();
    let dados = aplicarFiltrosConstrutor(dadosBaseConstrutor);
    if (
        sortConstrutor.col
        && Array.isArray(dados)
        && dados.length > 0
        && sortConstrutor.col in dados[0]
    ) {
        dados = ordenarDadosConstrutor(dados, sortConstrutor.col, sortConstrutor.dir);
    }
    renderizarTabelaConstrutor(dados);
}

function atualizarBotaoLimparFiltros() {
    const btn = document.getElementById("construtorLimparFiltrosBtn");
    if (!btn) return;
    const ativo = Object.keys(filtrosConstrutor).some(k => filtrosConstrutor[k] && filtrosConstrutor[k].size > 0);
    btn.disabled = !ativo;
}

function limparFiltrosConstrutor() {
    filtrosConstrutor = {};
    fecharPopupFiltro();
    reaplicarFiltrosConstrutor();
}

function valoresDistintosConstrutor(chave) {
    const vistos = new Set();
    (dadosBaseConstrutor || []).forEach(item => {
        vistos.add(item[chave] == null ? "" : String(item[chave]));
    });
    return Array.from(vistos);
}

function ordenarValoresFiltro(valores, numerico) {
    if (numerico) {
        return valores.sort((a, b) => {
            const na = Number(a);
            const nb = Number(b);
            const ra = isNaN(na) ? -Infinity : na;
            const rb = isNaN(nb) ? -Infinity : nb;
            return ra - rb;
        });
    }
    return valores.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function criarPopupFiltro() {
    const popup = document.createElement("div");
    popup.className = "construtor-filter-popup";
    popup.id = "construtorFilterPopup";
    popup.innerHTML =
        '<div class="filter-head">'
        + '<input type="text" class="filter-search" placeholder="Buscar valor...">'
        + "</div>"
        + '<label class="filter-checkall"><input type="checkbox"> Selecionar tudo</label>'
        + '<div class="filter-list"></div>'
        + '<div class="filter-actions">'
        + '<button type="button" class="btn-ghost" data-acao="limpar">Limpar filtro</button>'
        + '<button type="button" class="btn-ghost" data-acao="fechar">Fechar</button>'
        + "</div>";
    document.body.appendChild(popup);

    popup.querySelector(".filter-search").addEventListener("input", renderizarListaFiltro);
    popup.querySelector(".filter-checkall input").addEventListener("change", e => {
        aplicarFiltroCheckAll(e.target.checked);
    });
    popup.querySelector(".filter-list").addEventListener("change", e => {
        if (e.target.type !== "checkbox") return;
        aplicarFiltroItem(e.target);
    });
    popup.querySelector('[data-acao="limpar"]').addEventListener("click", () => {
        if (filtroAbertoCol) delete filtrosConstrutor[filtroAbertoCol];
        renderizarListaFiltro();
        reaplicarFiltrosConstrutor();
    });
    popup.querySelector('[data-acao="fechar"]').addEventListener("click", fecharPopupFiltro);
    return popup;
}

function filtroPopupEl() {
    if (!filtroPopup) filtroPopup = criarPopupFiltro();
    return filtroPopup;
}

function renderizarListaFiltro() {
    const popup = filtroPopupEl();
    const list = popup.querySelector(".filter-list");
    const checkAll = popup.querySelector(".filter-checkall input");
    if (!filtroAbertoCol) {
        list.innerHTML = "";
        checkAll.checked = false;
        return;
    }
    const chave = filtroAbertoCol;
    const q = (popup.querySelector(".filter-search").value || "").toLowerCase();
    const valores = valoresDistintosConstrutor(chave);
    ordenarValoresFiltro(valores, colEhNumericoConstrutor(dadosBaseConstrutor, chave));
    const ativos = filtrosConstrutor[chave];
    const todos = !ativos || ativos.size === 0;
    const filtrados = valores.filter(v => String(v).toLowerCase().includes(q));

    list.innerHTML = "";
    filtrados.forEach(v => {
        const label = document.createElement("label");
        label.className = "filter-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = v;
        cb.checked = todos || ativos.has(v);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + v));
        list.appendChild(label);
    });
    if (filtrados.length === 0) {
        list.innerHTML = '<div class="filter-empty">Nenhum valor encontrado.</div>';
    }

    checkAll.checked = valores.length > 0 && todos;
}

function atualizarCheckAllFiltro() {
    const popup = filtroPopupEl();
    if (!filtroAbertoCol) return;
    const chave = filtroAbertoCol;
    const valores = valoresDistintosConstrutor(chave);
    const ativos = filtrosConstrutor[chave];
    const todos = !ativos || ativos.size === 0;
    popup.querySelector(".filter-checkall input").checked = valores.length > 0 && todos;
}

function aplicarFiltroItem(cb) {
    if (!filtroAbertoCol) return;
    const chave = filtroAbertoCol;
    let ativos = filtrosConstrutor[chave];
    if (!ativos) {
        ativos = new Set(valoresDistintosConstrutor(chave));
        filtrosConstrutor[chave] = ativos;
    }
    if (cb.checked) {
        ativos.add(cb.value);
    } else {
        ativos.delete(cb.value);
    }
    if (ativos.size === 0) delete filtrosConstrutor[chave];
    atualizarCheckAllFiltro();
    reaplicarFiltrosConstrutor();
}

function aplicarFiltroCheckAll(marcar) {
    if (!filtroAbertoCol) return;
    const chave = filtroAbertoCol;
    const valores = valoresDistintosConstrutor(chave);
    if (marcar) {
        filtrosConstrutor[chave] = new Set(valores);
    } else {
        delete filtrosConstrutor[chave];
    }
    renderizarListaFiltro();
    reaplicarFiltrosConstrutor();
}

function abrirPopupFiltro(chave, btn) {
    filtroAbertoCol = chave;
    const popup = filtroPopupEl();
    popup.querySelector(".filter-search").value = "";
    renderizarListaFiltro();
    popup.classList.add("open");
    posicionarPopupFiltro(btn, popup);
    const search = popup.querySelector(".filter-search");
    if (search && search.focus) search.focus();
}

function posicionarPopupFiltro(btn, popup) {
    const rect = btn.getBoundingClientRect();
    const w = popup.offsetWidth || 300;
    const h = popup.offsetHeight || 400;
    let left = rect.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    popup.style.left = Math.max(8, left) + "px";
    popup.style.top = top + "px";
}

function fecharPopupFiltro() {
    filtroAbertoCol = null;
    if (filtroPopup) filtroPopup.classList.remove("open");
}

function togglePopupFiltro(chave, btn) {
    const popup = filtroPopupEl();
    if (filtroAbertoCol === chave && popup.classList.contains("open")) {
        fecharPopupFiltro();
        return;
    }
    abrirPopupFiltro(chave, btn);
}

/*
==========================================================
EXPORTAR EXCEL (registros do nó aberto)
==========================================================
*/

function nomeArquivoConstrutor() {
    const ctx = arvoreContexto;
    const nome = ctx
        ? [ctx.data_fmt, ctx.instrumento_num != null ? ctx.instrumento_num : "mês"]
            .filter(Boolean)
            .join(" - ")
        : "tabela_construtor";
    return nome.replace(/[\\/:*?"<>|]/g, "_");
}

function exportarExcelConstrutor() {
    if (!linhasConstrutor || linhasConstrutor.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
    const ordem = ordemConstrutor.length > 0 ? ordemConstrutor : colunasConstrutorAtivas();
    const dados = linhasConstrutor.map(item => {
        const linha = {};
        ordem.forEach(c => {
            if (c === SALDO_COLUNA) {
                linha["Saldo (R$)"] = item["saldo"] || 0;
            } else if (c === "Suplementação") {
                linha["Suplementação (R$)"] = item[c] || 0;
            } else if (c === "Cancelamento") {
                linha["Cancelamento (R$)"] = item[c] || 0;
            } else {
                linha[rotuloColuna(c)] = item[c] != null ? item[c] : "";
            }
        });
        return linha;
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    XLSX.writeFile(wb, nomeArquivoConstrutor() + ".xlsx");
}

document.addEventListener("DOMContentLoaded", () => {
    initConstrutor();
    construirCabecalhoUnico();
});