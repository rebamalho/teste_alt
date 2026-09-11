/*
==========================================================
JORNAL — TIMELINE DE PUBLICAÇÕES
==========================================================
*/

const MESES_PT = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

function escHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/*
==========================================================
FORMATAÇÃO DE VALORES
==========================================================
*/

function _jornalFormatarValor(valor) {
    const div = obterDivisor ? obterDivisor() : 1;
    const v = Number(valor || 0) / div;
    return "R$ " + v.toLocaleString("pt-BR", {
        minimumFractionDigits: v >= 1000 ? 0 : 2,
        maximumFractionDigits: 2
    }) + (obterSufixo ? obterSufixo() : "");
}

function _jornalValorRaw(valor) {
    return Number(valor || 0);
}

/*
==========================================================
TOP 5 ÓRGÃOS — BARRAS HORIZONTAIS
==========================================================
*/

function renderTop5Orgaos(topOrgaos) {
    const container = document.getElementById("jornalTop5Orgaos");
    if (!container) return;

    if (!topOrgaos || topOrgaos.length === 0) {
        container.innerHTML = '<span class="jornal-heatmap-empty">Sem dados de órgãos</span>';
        return;
    }

    let maxAbs = 0;
    topOrgaos.forEach(function(item) {
        const total = Math.abs(item.suplementacao || 0) + Math.abs(item.cancelamento || 0);
        if (total > maxAbs) maxAbs = total;
    });

    let html = '';

    topOrgaos.forEach(function(item) {
        const sup = item.suplementacao || 0;
        const can = item.cancelamento || 0;
        const sal = item.saldo || 0;
        const supW = maxAbs > 0 ? (Math.abs(sup) / maxAbs) * 100 : 0;
        const canW = maxAbs > 0 ? (Math.abs(can) / maxAbs) * 100 : 0;

        html += '<div class="top5-row">';
        html += '<div class="top5-orgao">' + escHtml(item.orgao) + '</div>';
        html += '<div class="top5-bars">';

        if (sup > 0) {
            html += '<div class="top5-bar top5-bar-sup" style="width:' + supW + '%;" title="Suplementação: ' + escHtml(_jornalFormatarValor(sup)) + '"></div>';
        }
        if (can > 0) {
            html += '<div class="top5-bar top5-bar-can" style="width:' + canW + '%;" title="Cancelamento: ' + escHtml(_jornalFormatarValor(can)) + '"></div>';
        }

        html += '</div>';
        html += '<div class="top5-valores">';
        html += '<span class="top5-sup">' + escHtml(_jornalFormatarValor(sup)) + '</span>';
        html += '<span class="top5-can">' + escHtml(_jornalFormatarValor(can)) + '</span>';
        html += '<span class="top5-saldo">' + escHtml(_jornalFormatarValor(sal)) + '</span>';
        html += '</div>';
        html += '</div>';
    });

    html += '<div class="top5-legend">';
    html += '<span class="top5-legend-item"><span class="top5-dot top5-dot-sup"></span>Suplementação</span>';
    html += '<span class="top5-legend-item"><span class="top5-dot top5-dot-can"></span>Cancelamento</span>';
    html += '<span class="top5-legend-item"><span class="top5-dot top5-dot-saldo"></span>Saldo</span>';
    html += '</div>';

    container.innerHTML = html;
}

/*
==========================================================
HEATMAP — ATIVIDADE MENSAL
==========================================================
*/

function renderHeatmap(heatmapMes) {
    const container = document.getElementById("jornalHeatmap");
    if (!container) return;

    if (!heatmapMes || heatmapMes.length === 0) {
        container.innerHTML = '<span class="jornal-heatmap-empty">Sem dados</span>';
        return;
    }

    let maxVal = 0;
    heatmapMes.forEach(function(item) {
        const v = Math.abs(item.suplementacao || 0) + Math.abs(item.cancelamento || 0);
        if (v > maxVal) maxVal = v;
    });

    var html = '<div class="heatmap-grid">';

    heatmapMes.forEach(function(item) {
        const total = Math.abs(item.suplementacao || 0) + Math.abs(item.cancelamento || 0);
        const intensidade = maxVal > 0 ? Math.pow(total / maxVal, 0.15) : 0;
        const opacidade = total > 0 ? Math.max(0.35, intensidade) : 0.06;
        const parts = (item.mes || "").split("/");
        if (parts.length < 2) return;
        const mesIdx = parseInt(parts[0], 10) - 1;
        const ano = parts[1];
        const pedidos = item.distinct_pedidos || 0;

        html += '<div class="heatmap-cell" style="background: var(--primary); opacity: ' + opacidade + ';" title="' +
            MESES_PT[mesIdx] + '/' + ano + ': ' + pedidos + ' pedidos">';
            html += '<div class="heatmap-cell-label">' + MESES_PT[mesIdx] + '</div>';
            html += '<div class="heatmap-cell-sub">' + ano + '</div>';
            html += '<div class="heatmap-cell-count">' + pedidos + '</div>';
            html += '<div class="heatmap-cell-unit">pedidos</div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/*
==========================================================
TIMELINE — CARDS DE PUBLICAÇÕES
==========================================================
*/

function renderTimeline(jornal) {
    const container = document.getElementById("jornalTimeline");
    if (!container) return;

    if (!jornal || jornal.length === 0) {
        container.innerHTML = '<div class="jornal-empty">Nenhuma publicação encontrada com os filtros selecionados.</div>';
        return;
    }

    var html = '<div class="timeline">';
    var mesAtual = "";

    jornal.forEach(function(reg) {
        const mesAno = reg.mes || "";
        if (mesAno !== mesAtual) {
            if (mesAtual !== "") {
                html += '</div>';
            }
            mesAtual = mesAno;
            html += '<div class="timeline-group">';
            html += '<div class="timeline-header"><span class="timeline-dot"></span><span class="timeline-mes">' + escHtml(mesAno) + '</span></div>';
        }

        const sup = reg.total_suplementado != null ? reg.total_suplementado : (reg.suplementacao || 0);
        const can = reg.total_cancelado != null ? reg.total_cancelado : (reg.cancelamento || 0);
        const sal = sup - can;

        var cardClass = "timeline-card";
        if (sal > 0) cardClass += " card-positive";
        else if (sal < 0) cardClass += " card-negative";

        html += '<div class="' + cardClass + '">';

        html += '<div class="jc-header">';
        html += '<div class="jc-date">' + escHtml(reg.data_fmt || "") + '</div>';
        html += '<div class="jc-instrumento">';
        if (reg.subtipo_ato) {
            html += '<span class="jc-subtipo">' + escHtml(reg.subtipo_ato) + '</span>';
        }
        html += '<span class="jc-inst-num">' + escHtml(reg.instrumento_num || "") + '</span>';
        if (reg.dou_link) {
            html += '<a class="jc-link" href="' + escHtml(reg.dou_link) + '" target="_blank" title="Abrir no DOU">';
            html += '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            html += '</a>';
        }
        html += '</div>';
        html += '</div>';

        var favorecidos = reg.favorecidos || [];
        var contrapartes = reg.contrapartes || [];
        if (favorecidos.length > 0 || contrapartes.length > 0) {
            html += '<div class="jc-entidades">';
            if (favorecidos.length > 0) {
                html += '<div class="jc-entidade-block">';
                html += '<div class="jc-entidade-titulo jc-entidade-titulo-fav">Favorecidos</div>';
                html += '<div class="jc-entidade-lista">';
                favorecidos.forEach(function(f) {
                    html += '<div class="jc-entidade-linha jc-entidade-linha-fav">';
                    html += '<span class="jc-entidade-nome">' + escHtml(f.orgao || "") + '</span>';
                    html += '<span class="jc-entidade-valor">(' + escHtml(_jornalFormatarValor(f.valor)) + ')</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }
            if (contrapartes.length > 0) {
                html += '<div class="jc-entidade-block">';
                html += '<div class="jc-entidade-titulo jc-entidade-titulo-can">Contraparte</div>';
                html += '<div class="jc-entidade-lista">';
                contrapartes.forEach(function(c) {
                    html += '<div class="jc-entidade-linha jc-entidade-linha-can">';
                    html += '<span class="jc-entidade-nome">' + escHtml(c.orgao || "") + '</span>';
                    html += '<span class="jc-entidade-valor">(' + escHtml(_jornalFormatarValor(c.valor)) + ')</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }
            html += '</div>';
        }

        html += '<div class="jc-values">';
        html += '<div class="jc-val jc-val-sup">';
        html += '<span class="jc-val-label">Total Suplementado</span>';
        html += '<span class="jc-val-valor">' + escHtml(_jornalFormatarValor(sup)) + '</span>';
        html += '</div>';
        html += '<div class="jc-val jc-val-can">';
        html += '<span class="jc-val-label">Total Cancelado</span>';
        html += '<span class="jc-val-valor">' + escHtml(_jornalFormatarValor(can)) + '</span>';
        html += '</div>';
        html += '</div>';

        html += '</div>';
    });

    if (mesAtual !== "") {
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
}

/*
==========================================================
RENDER JORNAL (ENTRY POINT)
==========================================================
*/

function renderJornal(jornal, topOrgaos, heatmapMes) {
    renderTop5Orgaos(topOrgaos || []);
    renderHeatmap(heatmapMes || []);
    renderTimeline(jornal || []);
}
