/*
==========================================================
VARIÁVEIS GLOBAIS
==========================================================
*/

let linhasTabela = [];
let detalhesTabela = {};

/*
==========================================================
HELPERS DE RENDERIZAÇÃO
==========================================================
*/

function escHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function cssAttr(v) {
    return JSON.stringify(String(v == null ? "" : v));
}

// Sem nenhum nó aberto (registros visíveis) a tabela fica em modo resumo:
// thead e linhas com apenas [Detalhamento | Supl/Canc/Saldo].
// O modo completo (colunas configuráveis entre Detalhamento e Supl/Canc) só
// entra ao expandir um nó que mostra registros.
function modoResumido() {
    return !arvoreContexto;
}

function totalColunasTabela() {
    const extras = (construtorColunas && !modoResumido()) ? construtorColunas.length : 0;
    return 1 + extras + 3;
}

function construirConteudoLinha(label, item) {
    // Linhas da árvore (Mês/Ano e Data/Instrumento/Órgãos): o rótulo + as
    // colunas de valor alinham com o thead. No modo completo a área das colunas
    // configuráveis é um único span vazio (os nomes dessas colunas ficam na
    // linha-cabeçalho congelada do nó expandido), preservando o alinhamento.
    const k = totalColunasTabela() - 4;

    let html = '<td class="detalhe-label-cell">' + label + "</td>";
    if (k > 0) {
        html += '<td colspan="' + k + '" class="config-span"></td>';
    }
    html += '<td class="numeric">' + formatarMoeda(item.suplementacao || 0) + "</td>"
        + '<td class="numeric">' + formatarMoeda(item.cancelamento || 0) + "</td>"
        + '<td class="numeric">' + formatarMoeda(item.saldo || 0) + "</td>";
    return html;
}

function abertoIcon(linha, aberto) {
    const icon = linha.querySelector(".toggle-icon");
    if (icon) icon.textContent = aberto ? "−" : "+";
}

/*
==========================================================
RENDERIZAÇÃO DA TABELA (árvore única)
==========================================================
*/

function renderizarTabela(dados, detalhes, manterContexto) {

    linhasTabela = dados;
    detalhesTabela = detalhes || {};

    // Por padrão a renderização volta ao modo resumo (fecha a árvore).
    // Os toggles/mudança de colunas passam manterContexto=1 para reconstruir
    // a árvore já refletindo o nó aberto (modo completo) sem perdê-lo.
    if (!manterContexto) {
        arvoreContexto = null;
    }

    const tbody = document.getElementById("tabelaBody");
    if (!tbody) return;

    construirCabecalhoUnico();

    tbody.innerHTML = "";

    if (!dados || dados.length === 0) {

        tbody.innerHTML = '<tr><td colspan="' + totalColunasTabela() + '" class="empty-table">Nenhum registro encontrado.</td></tr>';

        return;
    }

    dados.forEach(item => {

        const mes = item.meses || "";
        const temDetalhes =
            detalhesTabela[mes]
            && detalhesTabela[mes].length > 0;

        const linha = document.createElement("tr");

        linha.className = "row-mes";

        if (temDetalhes) {

            linha.classList.add("expandivel");

            linha.dataset.mes = mes;

        }

        linha.innerHTML = construirConteudoLinha(
            (temDetalhes ? '<span class="toggle-icon">+</span> ' : "")
                + escHtml(mes),
            item
        );

        tbody.appendChild(linha);

        if (!temDetalhes) return;

        if (visaoAtual === "nao_efetivadas") {

            // Não efetivadas: [Mês/Ano] -> (Registros)
            linha.addEventListener("click", () => {
                toggleMesRegistros(linha, mes);
            });
            return;

        }

        // Efetivadas: [Mês/Ano] -> [Data - Instrumento_Num - (Órgãos)] -> (Registros)
        detalhesTabela[mes].forEach(g => {

            const grupo = {
                data: g.data_fmt || "",
                inst: g.Instrumento_Num != null ? String(g.Instrumento_Num) : "",
                link: g.DOU_link || "",
                orgaos: g.orgaos || [],
                suplementacao: g.suplementacao || 0,
                cancelamento: g.cancelamento || 0,
                saldo: g.saldo || 0
            };

            const detLinha = document.createElement("tr");

            detLinha.className = "row-instr";

            detLinha.dataset.mes = mes;
            detLinha.dataset.fmt = grupo.data;
            detLinha.dataset.inst = grupo.inst;

            detLinha.style.display = "none";

            const texto =
                grupo.data + " - " +
                grupo.inst + " - " +
                grupo.orgaos.join(", ");

            const label =
                '<span class="toggle-icon">+</span> '
                + (grupo.link
                    ? '<a href="' + escHtml(grupo.link) + '" target="_blank" class="dou-link" data-stop>' + escHtml(texto) + '</a>'
                    : escHtml(texto));

            detLinha.innerHTML = construirConteudoLinha(label, grupo);

            tbody.appendChild(detLinha);

            detLinha.addEventListener("click", e => {
                if (e.target.closest("[data-stop]")) return;
                toggleInstrumentoRegistros(detLinha, grupo);
            });

        });

        linha.addEventListener("click", () => {
            alternarMesEfetivadas(linha, mes);
        });

    });

}

// Abre/fecha um mês (efetivadas): mostra/oculta os instrumentos do mês.
// Abrir um mês não carrega registros; estes entram (modo completo) apenas ao
// abrir um instrumento.
function alternarMesEfetivadas(linha, mes) {
    if (linha.classList.contains("aberto")) {
        // Fechar -> volta ao modo resumo.
        renderizarTabela(linhasTabela, detalhesTabela);
        return;
    }
    // Abrir -> encerra registros abertos (se houver) e mostra os instrumentos.
    if (arvoreContexto || document.querySelectorAll(".row-mes.aberto").length > 0) {
        renderizarTabela(linhasTabela, detalhesTabela);
    }
    const novaLinha = document.querySelector('.row-mes[data-mes=' + cssAttr(mes) + ']');
    if (!novaLinha) return;
    novaLinha.classList.add("aberto");
    abertoIcon(novaLinha, true);
    document.querySelectorAll('.row-instr[data-mes=' + cssAttr(mes) + ']').forEach(d => {
        d.style.display = "";
    });
}

/*
==========================================================
NÍVEL 3 DA ÁRVORE (registros no mesmo tbody)
==========================================================
*/

// Abre/fecha um mês (não efetivadas): um mês aberto mostra os registros
// diretamente, portanto alterna a tabela para o modo completo.
function toggleMesRegistros(linha, mes) {

    const abertoAgora =
        arvoreContexto
        && arvoreContexto.instrumento_num == null
        && arvoreContexto.data_fmt === mes;

    if (abertoAgora) {
        renderizarTabela(linhasTabela, detalhesTabela);
        return;
    }

    arvoreContexto = { data_fmt: mes, instrumento_num: null, linha: null };
    renderizarTabela(linhasTabela, detalhesTabela, 1);
    const novaLinha = document.querySelector('.row-mes[data-mes=' + cssAttr(mes) + ']');
    if (novaLinha) abrirContexto(novaLinha, { data_fmt: mes, instrumento_num: null });
}

// Abre/fecha um instrumento (efetivadas): mostrar registros alterna a tabela
// para o modo completo (colunas configuráveis entre Detalhamento e Supl/Canc).
function toggleInstrumentoRegistros(linha, grupo) {

    const abertoAgora =
        arvoreContexto
        && arvoreContexto.instrumento_num != null
        && arvoreContexto.data_fmt === grupo.data
        && String(arvoreContexto.instrumento_num) === String(grupo.inst);

    const ctx = { data_fmt: grupo.data, instrumento_num: grupo.inst };

    if (abertoAgora) {
        renderizarTabela(linhasTabela, detalhesTabela);
        return;
    }

    arvoreContexto = Object.assign({}, ctx, { linha: null });
    renderizarTabela(linhasTabela, detalhesTabela, 1);
    const novaLinha = procurarLinhaContexto(ctx);
    if (novaLinha) abrirContexto(novaLinha, ctx);
}

function fecharConstrutorRegistros() {
    const tbody = document.getElementById("tabelaBody");
    if (tbody) {
        tbody.querySelectorAll(".frozen-construtor-header, .row-registro, .tree-total-row").forEach(r => r.remove());
    }
    arvoreContexto = null;
}

/*
==========================================================
REABERTURA DO CONTEXTO APÓS MUDANÇA DE COLUNAS
==========================================================
*/

function procurarLinhaContexto(ctx) {
    const nodes = document.querySelectorAll("#tabelaBody .row-mes, #tabelaBody .row-instr");
    for (const el of nodes) {
        if (el.dataset.mes == null) continue;
        if (ctx.instrumento_num == null) {
            if (el.classList.contains("row-mes") && el.dataset.mes === ctx.data_fmt) return el;
        } else if (el.classList.contains("row-instr")
            && el.dataset.fmt === ctx.data_fmt
            && el.dataset.inst === String(ctx.instrumento_num)) {
            return el;
        }
    }
    return null;
}

function abrirContexto(linha, ctx) {
    if (ctx.instrumento_num != null) {
        const mes = linha.dataset.mes;
        const mesRow = document.querySelector('.row-mes[data-mes=' + cssAttr(mes) + ']');
        if (mesRow && !mesRow.classList.contains("aberto")) {
            mesRow.classList.add("aberto");
            abertoIcon(mesRow, true);
            document.querySelectorAll('.row-instr[data-mes=' + cssAttr(mes) + ']').forEach(d => {
                d.style.display = "";
            });
        }
    }
    linha.classList.add("aberto");
    abertoIcon(linha, true);
    arvoreContexto = Object.assign({}, ctx, { linha });
    carregarRegistrosConstrutor();
}

function aplicarMudancaColunas() {
    const ctx = arvoreContexto
        ? { data_fmt: arvoreContexto.data_fmt, instrumento_num: arvoreContexto.instrumento_num }
        : null;
    renderizarTabela(linhasTabela, detalhesTabela, 1);
    if (!ctx) return;
    const linha = procurarLinhaContexto(ctx);
    if (!linha) return;
    abrirContexto(linha, ctx);
}

/*
==========================================================
ATUALIZAR TABELA (chamado por filtros.js)
==========================================================
*/

function atualizarTabela(dados, detalhes) {

    renderizarTabela(dados, detalhes);

}

/*
==========================================================
EXPORTAR EXCEL
==========================================================
*/

function exportarExcel() {

    if (!linhasTabela || linhasTabela.length === 0) {

        alert("Nenhum dado para exportar.");

        return;

    }

    const dados = linhasTabela.map(item => ({

        "Meses": item.meses || "",

        "Suplementação (R$)": item.suplementacao || 0,

        "Cancelamento (R$)": item.cancelamento || 0,

        "Saldo (R$)": item.saldo || 0

    }));

    const ws = XLSX.utils.json_to_sheet(dados);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Alterações");

    XLSX.writeFile(
        wb,
        "alteracoes_orcamentarias.xlsx"
    );

}

/*
==========================================================
EXPORTAR PRINT
==========================================================
*/

function exportarPrint() {

    const section =
        document.querySelector(
            ".table-section"
        );

    if (!section) return;

    html2canvas(section, {
        backgroundColor: "#1a1a2e",
        scale: 2
    }).then(canvas => {

        const link =
            document.createElement("a");

        link.download =
            "alteracoes_orcamentarias.png";

        link.href =
            canvas.toDataURL("image/png");

        link.click();

    });

}


/*
==========================================================
FONTE / ESPAÇAMENTO DA TABELA
==========================================================
*/

let tabelaFontSize = 13;
let tabelaLinePad  = 10;

function tabelaFonte(delta) {

    tabelaFontSize =
        Math.min(24, Math.max(9, tabelaFontSize + delta));

    const wrap =
        document.getElementById("tabelaWrap");

    if (wrap) {

        wrap.querySelectorAll("th, td").forEach(el => {

            el.style.fontSize =
                tabelaFontSize + "px";

        });

    }

    const val =
        document.getElementById("tabelaFonteVal");

    if (val) val.textContent = tabelaFontSize;

}

function tabelaSpacing(delta) {

    tabelaLinePad =
        Math.min(30, Math.max(4, tabelaLinePad + delta));

    const wrap =
        document.getElementById("tabelaWrap");

    if (wrap) {

        wrap.querySelectorAll("td").forEach(td => {

            td.style.padding =
                tabelaLinePad + "px 12px";

        });

    }

    const val =
        document.getElementById("tabelaSpacingVal");

    if (val) val.textContent = tabelaLinePad;

}