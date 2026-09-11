/*
==========================================================
CONFIGURAÇÕES
==========================================================
*/

const STORAGE_KEY = "tema_orcamento";

/*
==========================================================
APLICAR TEMA
==========================================================
*/

function aplicarTema(tema) {

    document.documentElement.setAttribute(
        "data-theme",
        tema
    );

    atualizarBotaoTema(tema);

    localStorage.setItem(
        STORAGE_KEY,
        tema
    );
}

/*
==========================================================
ATUALIZAR TEXTO DO BOTÃO
==========================================================
*/

function atualizarBotaoTema(tema) {

    const botao = document.querySelector(
        ".btn-ghost"
    );

    if (!botao) return;

    if (tema === "dark") {
        botao.textContent = "☀️ Tema Claro";
    } else {
        botao.textContent = "🌙 Tema Escuro";
    }
}

/*
==========================================================
OBTER TEMA SALVO
==========================================================
*/

function obterTemaSalvo() {

    return localStorage.getItem(
        STORAGE_KEY
    );
}

/*
==========================================================
OBTER TEMA DO SISTEMA
==========================================================
*/

function obterTemaSistema() {

    const prefereEscuro =
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;

    return prefereEscuro
        ? "dark"
        : "light";
}

/*
==========================================================
ALTERNAR TEMA
==========================================================
*/

function alternarTema() {

    const temaAtual =
        document.documentElement.getAttribute(
            "data-theme"
        );

    const novoTema =
        temaAtual === "dark"
            ? "light"
            : "dark";

    aplicarTema(
        novoTema
    );
}

/*
==========================================================
INICIALIZAÇÃO
==========================================================
*/

function inicializarTema() {

    let tema = obterTemaSalvo();

    if (!tema) {
        tema = obterTemaSistema();
    }

    aplicarTema(
        tema
    );
}

/*
==========================================================
EXECUTA AO CARREGAR A PÁGINA
==========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        inicializarTema();

    }
);