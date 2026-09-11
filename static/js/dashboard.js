/*
==========================================================
DIVISOR DE UNIDADE
==========================================================
*/

function obterDivisor() {

    const u = unidadeAtual;

    if (u === "bi") return 1e9;

    if (u === "mi") return 1e6;

    if (u === "mil") return 1e3;

    return 1;

}

function obterSufixo() {

    const u = unidadeAtual;

    if (u === "bi") return " Bi";

    if (u === "mi") return " Mi";

    if (u === "mil") return " mil";

    return "";

}


/*
==========================================================
FORMATAÇÃO MONETÁRIA
==========================================================
*/

function formatarMoeda(valor) {

    const div = obterDivisor();

    const v = Number(valor) / div;

    return "R$ " + v.toLocaleString(
        "pt-BR",
        {
            minimumFractionDigits: v >= 1000 ? 0 : 2,
            maximumFractionDigits: 2
        }
    ) + obterSufixo();

}


/*
==========================================================
FORMATAÇÃO QUANTIDADE
==========================================================
*/

function formatarQuantidade(valor) {

    return Number(valor).toLocaleString("pt-BR");

}


/*
==========================================================
ATUALIZA CARDS
==========================================================
*/

function atualizarCards(cards) {

    const cardSuplementacao =
        document.getElementById(
            "cardSuplementacao"
        );

    const cardCancelamento =
        document.getElementById(
            "cardCancelamento"
        );

    const cardSaldo =
        document.getElementById(
            "cardSaldo"
        );

    const cardQuantidade =
        document.getElementById(
            "cardQuantidade"
        );

    if (cardSuplementacao) {

        cardSuplementacao.innerText =
            formatarMoeda(
                cards.suplementacao || 0
            );

    }

    if (cardCancelamento) {

        cardCancelamento.innerText =
            formatarMoeda(
                cards.cancelamento || 0
            );

    }

    if (cardSaldo) {

        cardSaldo.innerText =
            formatarMoeda(
                cards.saldo || 0
            );

    }

    if (cardQuantidade) {

        cardQuantidade.innerText =
            formatarQuantidade(
                cards.quantidade || 0
            );

    }

}


/*
==========================================================
INICIALIZA DASHBOARD
==========================================================
*/

function inicializarDashboard() {

    atualizarCards(cardsIniciais);

    if (visaoAtual === "dashboard") {
        if (typeof renderJornal === "function") {
            renderJornal(jornalInicial, topOrgaosInicial, heatmapMesInicial);
        }
    } else {
        renderizarTabela(tabelaInicial, detalhesIniciais);
    }

}


/*
==========================================================
ALTERAR UNIDADE
==========================================================
*/

function initUnidadeSelect() {
    const select = document.getElementById("unidade");
    if (!select) return;
    select.value = unidadeAtual || "bi";
    select.addEventListener("change", () => {
        unidadeAtual = select.value;

        if (cardsIniciais) {
            atualizarCards(cardsIniciais);
        }
        if (visaoAtual === "dashboard") {
            if (typeof renderJornal === "function") {
                renderJornal(jornalInicial, topOrgaosInicial, heatmapMesInicial);
            }
        } else {
            renderizarTabela(tabelaInicial, detalhesIniciais);
        }
        if (typeof atualizarTabelaConstrutor === "function" && tabelaConstrutorInicial) {
            atualizarTabelaConstrutor(tabelaConstrutorInicial);
        }
    });
}

document.addEventListener("DOMContentLoaded", initUnidadeSelect);

/*
==========================================================
EXPANDIR/RECOLHER A ÁREA DE FILTROS
==========================================================
*/

function initFilterPanelToggle() {
    const panel = document.getElementById("filterPanel");
    const toggle = document.getElementById("filterPanelToggle");
    if (!panel || !toggle) return;

    toggle.addEventListener("click", () => {
        const collapsed = panel.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
}


/*
==========================================================
EXECUÇÃO INICIAL
==========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        inicializarDashboard();
        initFilterPanelToggle();

    }
);
