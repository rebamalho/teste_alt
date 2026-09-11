# Painel de Alterações Orçamentárias

Painel web para monitoramento de **suplementações, cancelamentos e alterações orçamentárias**, construído com Flask e JavaScript puro (sem frameworks de frontend).

O painel permite filtrar a base, visualizar cards resumo, gráfico de evolução mensal, tabela de detalhamento mensal e um **construtor de tabela** flexível com exportação para Excel e imagem.

---

## Funcionalidades

### Dashboard
- **Cards resumo** (atualizados com os filtros): Suplementação, Cancelamento, Saldo Líquido e Quantidade de Alterações.
- **Gráfico de evolução mensal** (suplementação × cancelamento por mês), com opção de ocultar/mostrar.
- **Tabela de detalhamento por mês** com suplementação, cancelamento e saldo.
- **Detalhes por mês** (instrumento, órgão, data e link DOU).
- **Seletor de unidade** para valores monetários: bi, mi, mil, 1.

### Filtros
Filtros múltiplos com pills, com **auto-aplicação** (debounce de 400 ms) e dropdowns que se ajustam aos filtros já aplicados (exceto o próprio filtro, para não sumir do dropdown):

- Órgão, Classificação, IDUSO, RPs, GND, Exercício, Tipo Alteração, Financiamento (Subtipo do Ato), Pedido, Ação, UO e Localizador.
- GND e IDUSO filtram pelo **primeiro caractere**.

### Construtor de tabela
- Escolha de **colunas** pelo dropdown (15 colunas disponíveis + opção "Saldo", ocultável).
- **Colunas padrão**: Unidade Orçamentária, RP, GND, Subtipo do Ato, Data de Publicação (Suplementação e Cancelamento são agregações fixas sempre exibidas).
- **Título editável** — o nome informado é usado como nome do arquivo exportado.
- **Ordenação** por clique no cabeçalho: numérica (Menor → Maior / Maior → Menor) e texto (A-Z / Z-A), com indicadores ▲/▼ e persistência ao atualizar os dados.
- **Limite visual de 10 registros** com barra de rolagem para navegar pelos demais.
- **Exportar Excel** (`.xlsx`, todos os registros) e **exportar imagem** (`.png` via html2canvas, todos os registros).
- **Aumentar/diminuir fonte** (9–24 px) e **espaçamento** (4–30 px) da tabela.

### Tema
- Alternância claro/escuro via `static/js/tema.js` (persistida no navegador).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Flask 3.1, pandas 2.2, fastparquet |
| Frontend | HTML/CSS/JS puro (sem bundler) |
| Bibliotecas CDN | Chart.js, SheetJS (xlsx), html2canvas |
| Dados | Parquet (`data/alteracoes_orcamentarias.parquet`) |

---

## Estrutura do projeto

```
Painel - Alt_orc/
├── app.py                    # Aplicação Flask (rotas, API, agregações)
├── busca_dou.py              # Busca de links DOU (via PowerShell/urllib + BeautifulSoup)
├── gerar_parquet.py          # Pipeline: Excel -> parquet (executar antes de rodar)
├── requirements.txt
├── data/
│   ├── alteracoes_orcamentarias.parquet   # Base usada pelo painel
│   ├── alteracoes_orcamentarias.xlsx      # Fonte bruta (gerar_parquet.py)
│   ├── orgao_sigla.csv                    # Dimensão órgão/sigla
│   └── meta.json                          # Metadados (data de geração)
├── templates/
│   ├── base.html             # Layout base (header, tema, CDNs)
│   └── alteracoes.html       # Página do painel
└── static/
    ├── css/                  # layout, filtros, cards, tabela, alteracoes
    ├── img/
    └── js/
        ├── tema.js           # Alternância claro/escuro
        ├── filtros.js        # Lógica de filtros + auto-aplicação + chamadas /dados
        ├── dashboard.js      # Cards, gráfico (Chart.js) e KPI
        ├── tabela.js         # Tabela de detalhamento mensal
        └── construtor.js     # Construtor de tabela (colunas, ordenação, exportação)
```

---

## Instalação e execução

```bash
# 1. Criar e ativar o ambiente virtual
python -m venv venv
venv\Scripts\activate

# 2. Instalar dependências
pip install -r requirements.txt

# 3. (Opcional) Regenerar o parquet a partir do Excel
python gerar_parquet.py

# 4. Executar a aplicação
python app.py
```

Acesse `http://localhost:5000`.

> A aplicação lê `data/alteracoes_orcamentarias.parquet` em cache (primeira leitura). Para atualizar os dados, rode `python gerar_parquet.py` e reinicie o servidor.

---

## Rotas e API

| Rota | Método | Descrição |
|---|---|---|
| `/` | GET | Página principal (cards, filtros, gráfico, tabelas via SSR) |
| `/dados` | POST | JSON com `{ filtros, colunas }` → cards, gráfico, tabelas e construtor atualizados |
| `/api/filtros-disponiveis` | POST | Valores disponíveis de cada filtro, dado o conjunto atual de filtros |

Exemplo de corpo de `/dados`:

```json
{
  "filtros": { "orgao": ["MEC"], "exercicio": [2026] },
  "colunas": ["Unidade Orçamentária (desc.)", "GND (desc.)"]
}
```

Notas da API:
- Se `colunas` for omitido (`null`), o backend usa `COLUNAS_CONSTRUTOR_PADRAO`; um array vazio retorna tabela vazia.
- O JSON é sanitizado por `SemNaNJSONProvider` para evitar `NaN` literal (que quebra o `JSON.parse` do navegador).

---

## Pipeline de dados

1. **`busca_dou.py`** — busca o HTML do DOU para extração de links. Tenta primeiro via PowerShell `Invoke-WebRequest` (usa o SSL do Windows) e, em caso de falha, cai para `urllib` com contexto SSL.
2. **`gerar_parquet.py`** — lê `data/alteracoes_orcamentarias.xlsx` (cabeçalho na linha 5), aplica transformações de negócio, enriquece com a dimensão `orgao_sigla.csv`, grava o parquet e o `meta.json` (data de geração extraída do arquivo Excel).

---

## Construtor de tabela — detalhes de implementação

- **Colunas**: `COLUNAS_CONSTRUTOR_PADRAO` (padrão) e `COLUNAS_CONSTRUTOR_EXCLUIR` (colunas proibidas no dropdown) em `app.py`.
- **Agregação** (`gerar_tabela_construtor`): agrupa por colunas escolhidas, soma Suplementação/Cancelamento, calcula `saldo` e ordena por Suplementação/Cancelamento desc. Valores vazios viram `(vazio)`; datas formatadas como `dd/mm/aaaa`; GND reduzido ao primeiro caractere.
- **Frontend** (`construtor.js`):
  - `nomeArquivoConstrutor()` — usa o título informado como nome do arquivo exportado (sanitiza `\ / : * ? " < > |`; fallback `construtor_tabela`).
  - `ajustarAlturaConstrutor()` — limita o `max-height` da tabela a 10 linhas (medidas reais), mantendo barra de rolagem e todas as linhas no DOM.
  - Exportação de imagem usa `onclone` do html2canvas para remover o limite de altura e capturar **todos** os registros.

---

## Testes / verificação

A suíte de verificação usa **jsdom** contra o servidor Flask em uma porta de teste (5011):

```bash
# Servidor de teste (arquivo launch_flask.py em um diretório temporário)
python launch_flask.py   # app.run(port=5011, debug=False, use_reloader=False)

# Teste (Node + jsdom)
node test_*.js
```

Casos cobertos: renderização inicial, adicionar/remover colunas, ocultar/exibir Saldo, exportação Excel (com/sem Saldo), ordenação numérica e alfabética (com persistência após atualização), limites de exibição e nomeação de arquivos exportados.

**Atenção (jsdom):**
- Polifill de `fetch` é obrigatório (`new URL(url, "http://localhost:5011/")`).
- `innerText` não é implementado — usar `textContent`.
- `offsetHeight` retorna 0 (sem engine de layout) — o código possui fallback.
- Salvar arquivos de teste com acentos via editor UTF-8 (`Set-Content` do PowerShell grava ANSI e corrompe caracteres).
