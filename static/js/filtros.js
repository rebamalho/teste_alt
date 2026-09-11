/*
==========================================================
DEBOUNCE
==========================================================
*/

function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/*
==========================================================
MULTI-SELECT COMPONENT (dropdowns com checkboxes)
==========================================================
*/

const FILTER_IDS = [
    "orgao", "tipo_alteracao", "exercicio",
    "rps", "classificacao", "financiamento",
    "iduso", "gnd"
];

const PILL_FILTER_IDS = ["orgao", "exercicio", "rps", "classificacao", "iduso", "gnd"];

function initMultiSelect() {

    document.querySelectorAll(".ms-wrap").forEach(wrap => {

        const select =
            wrap.querySelector("select[multiple]");

        if (!select) return;

        const container =
            document.createElement("div");

        container.className = "ms-container";

        const btn =
            document.createElement("button");

        btn.type = "button";
        btn.className = "ms-btn";
        btn.textContent = "Todos";

        const panel =
            document.createElement("div");

        panel.className = "ms-panel";

        const search =
            document.createElement("input");

        search.type = "text";
        search.className = "ms-search";
        search.placeholder = "Buscar...";

        const optWrap =
            document.createElement("div");

        optWrap.className = "ms-options";

        const labelAll =
            document.createElement("label");

        labelAll.className = "ms-option";

        const cbAll =
            document.createElement("input");

        cbAll.type = "checkbox";
        cbAll.checked = true;
        cbAll.className = "ms-check-all";

        labelAll.appendChild(cbAll);
        labelAll.appendChild(
            document.createTextNode(" Todos")
        );
        optWrap.appendChild(labelAll);

        Array.from(select.options).forEach(opt => {

            const label =
                document.createElement("label");

            label.className = "ms-option";

            const cb =
                document.createElement("input");

            cb.type = "checkbox";
            cb.value = opt.value;
            cb.textContent = opt.text;

            label.appendChild(cb);
            label.appendChild(
                document.createTextNode(" " + opt.text)
            );
            optWrap.appendChild(label);

        });

        panel.appendChild(search);
        panel.appendChild(optWrap);
        container.appendChild(btn);
        container.appendChild(panel);
        wrap.appendChild(container);

        btn.addEventListener("click", e => {

            e.stopPropagation();

            document.querySelectorAll(
                ".ms-panel.open"
            ).forEach(p => {

                if (p !== panel)
                    p.classList.remove("open");

            });

            document.getElementById("gsDropdown")
                .classList.remove("open");

            panel.classList.toggle("open");

        });

        cbAll.addEventListener("change", () => {

            const checked = cbAll.checked;

            optWrap.querySelectorAll(
                "input[type=checkbox]:not(.ms-check-all)"
            ).forEach(cb => {

                cb.checked = checked;

            });

            syncSelect(select, optWrap);
            updateBtnLabel(btn, optWrap);
            agendarAtualizacao();

        });

        optWrap.addEventListener("change", e => {

            if (e.target.type !== "checkbox") return;
            if (e.target.classList.contains("ms-check-all")) return;

            syncSelect(select, optWrap);
            updateBtnLabel(btn, optWrap);

            const total = optWrap.querySelectorAll(
                "input[type=checkbox]:not(.ms-check-all)"
            ).length;

            const sel = optWrap.querySelectorAll(
                "input[type=checkbox]:not(.ms-check-all):checked"
            ).length;

            cbAll.checked = sel === total;
            agendarAtualizacao();

        });

        search.addEventListener("input", () => {

            const q = search.value.toLowerCase();

            optWrap.querySelectorAll(
                ".ms-option:not(:first-child)"
            ).forEach(label => {

                label.style.display =
                    label.textContent
                        .toLowerCase()
                        .includes(q)
                        ? ""
                        : "none";

            });

        });

    });

}

/*
==========================================================
PILL BUTTONS (Órgão, GND, RP, IDUSO, Classificação)
==========================================================
*/

function initPills() {
    PILL_FILTER_IDS.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const pillContainerId = "pills" + id.charAt(0).toUpperCase() + id.slice(1);
        const container = document.getElementById(pillContainerId);
        if (!container) return;

        container.innerHTML = "";
        Array.from(select.options).forEach(opt => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = "pill";
            pill.textContent = opt.value || opt.text;
            if (opt.selected) pill.classList.add("active");
            pill.dataset.value = opt.value;
            pill.addEventListener("click", () => {
                const isActive = pill.classList.toggle("active");
                // Sync hidden select
                Array.from(select.options).forEach(o => {
                    if (o.value === opt.value) o.selected = isActive;
                });
                agendarAtualizacao();
            });
            container.appendChild(pill);
        });
    });
}

function rebuildPills(id) {
    const select = document.getElementById(id);
    if (!select) return;
    const pillContainerId = "pills" + id.charAt(0).toUpperCase() + id.slice(1);
    const container = document.getElementById(pillContainerId);
    if (!container) return;

    const selecionados = Array.from(select.selectedOptions).map(o => o.value);
    container.innerHTML = "";
    Array.from(select.options).forEach(opt => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill";
        pill.textContent = opt.value || opt.text;
        if (selecionados.includes(opt.value)) pill.classList.add("active");
        pill.dataset.value = opt.value;
        pill.addEventListener("click", () => {
            const isActive = pill.classList.toggle("active");
            Array.from(select.options).forEach(o => {
                if (o.value === opt.value) o.selected = isActive;
            });
            agendarAtualizacao();
        });
        container.appendChild(pill);
    });
}

/*
==========================================================
AÇÕES RÁPIDAS DO FILTRO DE ÓRGÃOS (selecionar/limpar todos)
==========================================================
*/

function _setOrgaos(valor) {
    const select = document.getElementById("orgao");
    if (!select) return;
    Array.from(select.options).forEach(opt => {
        opt.selected = valor;
    });
    rebuildPills("orgao");
    reconstruirMultiSelect("orgao");
    agendarAtualizacao();
    _aplicarFiltrosSilencioso();
}

function selecionarTodosOrgaos() {
    _setOrgaos(true);
}

function limparOrgaos() {
    _setOrgaos(false);
}

/*
==========================================================
RECONSTRUIR OPÇÕES DE UM FILTRO (responsivo)
==========================================================
*/

function reconstruirMultiSelect(id) {
    const wrap = document.getElementById(id)?.closest(".ms-wrap");
    if (!wrap) return;
    const select = wrap.querySelector("select[multiple]");
    if (!select) return;
    const container = wrap.querySelector(".ms-container");
    if (!container) return;
    const panel = container.querySelector(".ms-panel");
    const optWrap = panel?.querySelector(".ms-options");
    if (!optWrap) return;

    const selecionados = Array.from(select.selectedOptions).map(o => o.value);

    optWrap.innerHTML = "";

    const labelAll = document.createElement("label");
    labelAll.className = "ms-option";
    const cbAll = document.createElement("input");
    cbAll.type = "checkbox";
    cbAll.className = "ms-check-all";
    cbAll.checked = selecionados.length === select.options.length;
    labelAll.appendChild(cbAll);
    labelAll.appendChild(document.createTextNode(" Todos"));
    optWrap.appendChild(labelAll);

    Array.from(select.options).forEach(opt => {
        const label = document.createElement("label");
        label.className = "ms-option";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = opt.value;
        if (selecionados.includes(opt.value)) {
            cb.checked = true;
        }
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + opt.text));
        optWrap.appendChild(label);
    });

    cbAll.addEventListener("change", () => {
        const checked = cbAll.checked;
        optWrap.querySelectorAll("input[type=checkbox]:not(.ms-check-all)").forEach(cb => {
            cb.checked = checked;
        });
        syncSelect(select, optWrap);
        updateBtnLabel(container.querySelector(".ms-btn"), optWrap);
        agendarAtualizacao();
    });

    optWrap.addEventListener("change", e => {
        if (e.target.type !== "checkbox") return;
        if (e.target.classList.contains("ms-check-all")) return;
        syncSelect(select, optWrap);
        updateBtnLabel(container.querySelector(".ms-btn"), optWrap);
        const total = optWrap.querySelectorAll("input[type=checkbox]:not(.ms-check-all)").length;
        const sel = optWrap.querySelectorAll("input[type=checkbox]:not(.ms-check-all):checked").length;
        cbAll.checked = sel === total;
        agendarAtualizacao();
    });

    const btn = container.querySelector(".ms-btn");
    if (btn) {
        updateBtnLabel(btn, optWrap);
    }
}

/*
==========================================================
ATUALIZAR FILTROS RESPONSIVOS
==========================================================
*/

let _atualizandoFiltros = false;

async function atualizarOpcoesFiltros() {
    if (_atualizandoFiltros) return;
    _atualizandoFiltros = true;

    const filtrosAtuais = obterFiltros();
    try {
        const resposta = await fetch("/api/filtros-disponiveis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...filtrosAtuais, visao: visaoAtual })
        });
        if (!resposta.ok) return;
        const dados = await resposta.json();

        const chaveMap = {
            "orgao": "orgaos",
            "tipo_alteracao": "tipos_alteracao",
            "exercicio": "exercicios",
            "rps": "rps",
            "classificacao": "classificacoes",
            "financiamento": "financiamentos",
            "iduso": "idusos",
            "gnd": "gnds"
        };

        FILTER_IDS.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const chave = chaveMap[id];
            const novosValores = dados[chave] || [];
            const selecionados = Array.from(select.selectedOptions).map(o => o.value);

            select.innerHTML = "";
            novosValores.forEach(v => {
                const opt = document.createElement("option");
                opt.value = v;
                opt.text = v;
                if (selecionados.includes(v)) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });

            reconstruirMultiSelect(id);
            if (PILL_FILTER_IDS.includes(id)) rebuildPills(id);
        });

        if (dados.pedidos || dados.acoes || dados.uos || dados.localizadores) {
            preencherGs(dados);
        }

    } catch (erro) {
        console.error("Erro ao atualizar opções de filtros:", erro);
    } finally {
        _atualizandoFiltros = false;
        // Auto-aplicar os filtros nos dados da dashboard
        _aplicarFiltrosSilencioso();
    }
}

const agendarAtualizacao = debounce(atualizarOpcoesFiltros, 400);

/*
==========================================================
APLICAR FILTROS (silencioso, sem loading)
==========================================================
*/

let _aplicando = false;

async function _aplicarFiltrosSilencioso() {
    if (_aplicando) return;
    _aplicando = true;

    const filtros = obterFiltros();
    const corpo = { ...filtros, visao: visaoAtual };
    if (typeof construtorColunas !== "undefined") {
        corpo.colunas = construtorColunas;
    }
    try {
        const resposta = await fetch("/dados", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo)
        });
        if (!resposta.ok) return;
        const dados = await resposta.json();

        cardsIniciais = dados.cards;
        tabelaInicial = dados.tabela;
        if (dados.tabela_construtor) {
            tabelaConstrutorInicial = dados.tabela_construtor;
        }
        if (typeof dados.jornal !== "undefined") {
            jornalInicial = dados.jornal;
        }
        if (typeof dados.top_orgaos !== "undefined") {
            topOrgaosInicial = dados.top_orgaos;
        }
        if (typeof dados.heatmap_mes !== "undefined") {
            heatmapMesInicial = dados.heatmap_mes;
        }

        atualizarCards(dados.cards);
        if (visaoAtual === "dashboard") {
            if (typeof renderJornal === "function") {
                renderJornal(dados.jornal, dados.top_orgaos, dados.heatmap_mes);
            }
        } else {
            atualizarTabela(dados.tabela, dados.detalhes);
            if (typeof atualizarTabelaConstrutor === "function") {
                atualizarTabelaConstrutor(dados.tabela_construtor);
            }
        }
    } catch (erro) {
        console.error("Erro ao aplicar filtros:", erro);
    } finally {
        _aplicando = false;
    }
}

function syncSelect(select, optWrap) {

    const checks =
        optWrap.querySelectorAll(
            "input[type=checkbox]:not(.ms-check-all)"
        );

    Array.from(select.options).forEach((opt, i) => {

        opt.selected = checks[i].checked;

    });

}

function updateBtnLabel(btn, optWrap) {

    const checks =
        optWrap.querySelectorAll(
            "input[type=checkbox]:not(.ms-check-all):checked"
        );

    const total =
        optWrap.querySelectorAll(
            "input[type=checkbox]:not(.ms-check-all)"
        ).length;

    if (checks.length === 0) {

        btn.textContent = "Todos";

    } else if (checks.length === total) {

        btn.textContent = "Todos selecionados";

    } else {

        btn.textContent =
            checks.length + " selecionado(s)";

    }

}


/*
==========================================================
GOOGLE-STYLE SEARCH (Pedido, Ação, UO, Localizador)
==========================================================
*/

const GS_COLORS = {
    "Pedido":     { bg: "#3b82f6", label: "Pedido" },
    "Ação":       { bg: "#22c55e", label: "Ação" },
    "UO":         { bg: "#f97316", label: "UO" },
    "Localizador":{ bg: "#a855f7", label: "Localizador" }
};

const GS_SELECT_MAP = {
    "Pedido":      "pedido",
    "Ação":        "acao",
    "UO":          "uo",
    "Localizador": "localizador"
};

let gsSelecionados = [];

// Opções da busca global (Pedido, Ação, UO, Localizador).
// Populadas via /api/filtros-disponiveis (não ficam mais inline no HTML).
let gsData = [];

async function carregarOpcoesGs() {
    try {
        const resposta = await fetch("/api/filtros-disponiveis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...obterFiltros(), visao: visaoAtual })
        });
        if (!resposta.ok) return;
        const dados = await resposta.json();
        preencherGs(dados);
    } catch (erro) {
        console.error("Erro ao carregar opções da busca:", erro);
    }
}

function preencherGs(dados) {
    if (!dados.pedidos && !dados.acoes && !dados.uos && !dados.localizadores) return;
    gsData.length = 0;
    (dados.pedidos || []).forEach(v => gsData.push({ tipo: "Pedido", valor: String(v) }));
    (dados.acoes || []).forEach(v => gsData.push({ tipo: "Ação", valor: v }));
    (dados.uos || []).forEach(v => gsData.push({ tipo: "UO", valor: v }));
    (dados.localizadores || []).forEach(v => gsData.push({ tipo: "Localizador", valor: v }));
    gsSelecionados = gsSelecionados.filter(item => {
        return gsData.some(d => d.tipo === item.tipo && d.valor === item.valor);
    });
    gsRenderChips();
    gsSyncSelects();
}

function renderGsLegend() {

    const legend =
        document.getElementById("gsLegend");

    if (!legend) return;

    legend.innerHTML = "";

    Object.values(GS_COLORS).forEach(item => {

        const el =
            document.createElement("span");

        el.className = "gs-legend-item";

        const dot =
            document.createElement("span");

        dot.className = "gs-legend-dot";

        dot.style.background = item.bg;

        el.appendChild(dot);

        el.appendChild(
            document.createTextNode(" " + item.label)
        );

        legend.appendChild(el);

    });

}

function initGoogleSearch() {

    const input =
        document.getElementById("gsInput");

    const dropdown =
        document.getElementById("gsDropdown");

    const chips =
        document.getElementById("gsChips");

    if (!input) return;

    renderGsLegend();

    input.addEventListener("input", () => {

        const q = input.value.trim().toLowerCase();

        if (q.length < 1) {

            dropdown.classList.remove("open");
            dropdown.innerHTML = "";
            return;

        }

        const results =
            gsData.filter(item =>

                !gsSelecionados.some(
                    s => s.tipo === item.tipo
                         && s.valor === item.valor
                )
                &&
                item.valor.toLowerCase().includes(q)

            ).slice(0, 30);

        if (results.length === 0) {

            dropdown.classList.remove("open");
            dropdown.innerHTML = "";
            return;

        }

        dropdown.innerHTML = "";

        results.forEach(item => {

            const color =
                GS_COLORS[item.tipo];

            const row =
                document.createElement("div");

            row.className = "gs-result";

            row.innerHTML = `
                <span class="gs-tag"
                      style="background:${color.bg}">
                    ${color.label}
                </span>
                <span class="gs-text">
                    ${item.valor}
                </span>
            `;

            row.addEventListener("click", () => {

                gsAdicionar(item);
                input.value = "";
                dropdown.classList.remove("open");
                dropdown.innerHTML = "";

            });

            dropdown.appendChild(row);

        });

        dropdown.classList.add("open");

    });

    input.addEventListener("focus", () => {

        if (dropdown.children.length > 0)
            dropdown.classList.add("open");

    });

    document.addEventListener("click", e => {

        if (!e.target.closest(".gs-wrap"))
            dropdown.classList.remove("open");

    });

}

function gsAdicionar(item) {

    gsSelecionados.push(item);

    gsRenderChips();
    gsSyncSelects();
    agendarAtualizacao();

}

function gsRemover(index) {

    gsSelecionados.splice(index, 1);

    gsRenderChips();
    gsSyncSelects();
    agendarAtualizacao();

}

function gsRenderChips() {

    const chips =
        document.getElementById("gsChips");

    chips.innerHTML = "";

    gsSelecionados.forEach((item, i) => {

        const color =
            GS_COLORS[item.tipo];

        const chip =
            document.createElement("span");

        chip.className = "gs-chip";

        chip.innerHTML = `
            <span class="gs-chip-tag"
                  style="background:${color.bg}">
                ${color.label}
            </span>
            <span class="gs-chip-text">
                ${item.valor}
            </span>
            <button class="gs-chip-x"
                    onclick="gsRemover(${i})">
                &times;
            </button>
        `;

        chips.appendChild(chip);

    });

}

function gsSyncSelects() {

    // Reconstrói as options dos selects ocultos (pedido/acao/uo/localizador)
    // a partir das seleções atuais. Mantém apenas os valores selecionados —
    // não carregamos mais as milhares de opções no HTML.
    Object.entries(GS_SELECT_MAP).forEach(([tipo, id]) => {

        const select =
            document.getElementById(id);

        if (!select) return;

        const valores =
            gsSelecionados
                .filter(item => item.tipo === tipo)
                .map(item => item.valor);

        select.innerHTML = "";

        valores.forEach(valor => {

            const opt =
                document.createElement("option");

            opt.value = valor;
            opt.text = valor;
            opt.selected = true;

            select.appendChild(opt);

        });

    });

}


/*
==========================================================
OBTER FILTROS SELECIONADOS
==========================================================
*/

function obterFiltros() {

    const filtros = {};

    FILTER_IDS.forEach(id => {

        const select =
            document.getElementById(id);

        filtros[id] =
            Array.from(select.selectedOptions)
                .map(o => o.value);

    });

    ["pedido", "acao", "uo", "localizador"]
        .forEach(id => {

            const select =
                document.getElementById(id);

            filtros[id] =
                Array.from(select.selectedOptions)
                    .map(o => o.value);

        });

    return filtros;

}


/*
==========================================================
APLICAR FILTROS
==========================================================
*/

/* ==========================================================
   LIMPAR FILTROS
   ========================================================== */

function limparFiltros() {

    FILTER_IDS.forEach(id => {

        const select =
            document.getElementById(id);

        Array.from(select.options).forEach(opt => {

            opt.selected = false;

        });

    });

    document.querySelectorAll(
        ".ms-check-all"
    ).forEach(cb => {

        cb.checked = true;

    });

    document.querySelectorAll(
        ".ms-btn"
    ).forEach(btn => {

        btn.textContent = "Todos";

    });

    // Clear pill active states
    document.querySelectorAll(".pill").forEach(p => {
        p.classList.remove("active");
    });

    gsSelecionados = [];

    gsRenderChips();
    gsSyncSelects();

    agendarAtualizacao();
    _aplicarFiltrosSilencioso();

}


/*
==========================================================
LOADING
==========================================================
*/



/*
==========================================================
INIT
==========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initMultiSelect();

        initPills();

        initGoogleSearch();

        // Popula a busca global (Pedido, Ação, UO, Localizador) via API —
        // removidos do HTML inline para reduzir o tamanho da página.
        carregarOpcoesGs();

    }
);
