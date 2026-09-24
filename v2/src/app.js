/* ═══════════════════════════════════════════
   GDI DASHBOARD v2 — app.js
   Reads data/data.json (generated por GitHub Actions)
═══════════════════════════════════════════ */

'use strict';

/* ── State ── */
let DATA = null;          // raw data from data.json
let RECORDS = [];         // all incidence records
let RECORDS_SS = [];      // sin stock subset
let RECORDS_KR = [];      // kronotime subset
let RECORDS_MCI_ING = []; // ingresadas
let RECORDS_JIRAS = [];   // jiras
let activeTab = 'overview';

/* ── Chart instances (destroy before recreate) ── */
const CHARTS = {};

/* ══════════════════════════════════
   BOOTSTRAP
══════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  startClock();
  loadData();
});

function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('liveClock').textContent = now.toLocaleTimeString('es-CO', { hour12: false });
    document.getElementById('liveDate').textContent = now.toLocaleDateString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  }
  tick();
  setInterval(tick, 1000);
}

async function loadData() {
  const loadEl = document.getElementById('loadingScreen');
  const errEl  = document.getElementById('errorScreen');
  loadEl.style.display = 'flex';
  errEl.style.display  = 'none';

  // 1. Si generate_data_local.py generó data.js, usarlo directamente (funciona con file://)
  if (window.DASHBOARD_DATA) {
    DATA = window.DASHBOARD_DATA;
    processData();
    loadEl.style.display = 'none';
    renderAll();
    updateLastUpdate();
    return;
  }

  // 2. Intentar fetch (funciona en servidor HTTP / Azure)
  try {
    const resp = await fetch('../data/data.json?_=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    DATA = await resp.json();
    processData();
    loadEl.style.display = 'none';
    renderAll();
    updateLastUpdate();
  } catch (e) {
    console.warn('[loadData] No se pudo cargar data.json — usando datos demo:', e.message);
    loadEl.style.display = 'none';
    DATA = buildDemoData();
    processData();
    renderAll();
    updateLastUpdate();
  }
}

function updateLastUpdate() {
  const el = document.getElementById('lastUpdate');
  if (DATA && DATA.generatedAt) {
    const d = new Date(DATA.generatedAt);
    el.textContent = 'Act. ' + d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
                   + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else {
    el.textContent = 'Datos demo';
  }
}

/* ══════════════════════════════════
   PROCESS DATA
══════════════════════════════════ */
function processData() {
  RECORDS     = (DATA.incidencias || []).map(normalize);
  RECORDS_SS  = RECORDS.filter(isSinStock);
  RECORDS_KR  = RECORDS.filter(isKrono);
  RECORDS_MCI_ING = DATA.ingresadas || [];
  RECORDS_JIRAS   = DATA.jiras || [];

  // Update nav badges
  document.getElementById('badge-sinstock').textContent  = RECORDS_SS.length;
  document.getElementById('badge-kronotime').textContent = RECORDS_KR.length;
}

function normalize(r) {
  function s(v) { return (v || '').toString().trim(); }
  return {
    fecha:    s(r.fecha),
    fn:       s(r.fn),          // fecha notificacion JIRA
    marca:    s(r.marca),
    pais:     s(r.pais),
    estado:   s(r.estado),      // Comentario continuidad
    com:      s(r.com),         // Comentario continuidad (filtros)
    ops:      s(r.ops),         // Duplicado / Acción OPS
    pen:      s(r.pen),         // Pendiente por
    ov:       s(r.ov),
    ticket:   s(r.ticket),
    pendiente:s(r.pendiente || r.pen),
    proveedor:s(r.proveedor),
    canal:    s(r.canal),
    detalle:  s(r.detalle),
  };
}

function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function isSinStock(r) {
  return norm(r.com).includes('sin stock');
}

function isKrono(r) {
  return norm(r.com).trim() === 'escalado con kronotime';
}

/* ══════════════════════════════════
   RENDER ALL
══════════════════════════════════ */
function renderAll() {
  buildMonthSelects();
  renderOverview();
  renderSinStock();
  renderKrono();
  renderMCI();
  renderJiras();
}

/* ── Month selects (SinStock, Kronotime, MCI) ── */

/* ── Mes presente o más reciente con datos ── */
function getCurrentMes() {
  var hoy  = new Date();
  var mesHoy = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
  var meses  = getMonths(RECORDS); // ordenados desc
  if (meses.indexOf(mesHoy) !== -1) return mesHoy;
  return meses.length ? meses[0] : mesHoy; // fallback al más reciente
}

/* ── Month select helpers ── */
function getMonths(recs) {
  const ms = [...new Set(recs.map(r => r.fecha.substring(0, 7)))].filter(Boolean).sort().reverse();
  return ms;
}

function buildMonthSelects() {
  const ms  = getMonths(RECORDS);
  const msSS = getMonths(RECORDS_SS);
  const msKR = getMonths(RECORDS_KR);
  const msI  = getMonths(RECORDS_MCI_ING.map(r => ({ fecha: r.fecha || '' })));

  fillSelect('ss-mes', msSS.length ? msSS : ms);
  fillSelect('kr-mes', msKR.length ? msKR : ms);
  fillSelect('mci-mes', msI.length ? msI : ms);
}

function fillSelect(id, months) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = el.value;
  el.innerHTML = '';
  months.forEach(function (m, i) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = fmtMonth(m);
    el.appendChild(opt);
  });
  if (prev && months.includes(prev)) el.value = prev;
}

function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return (names[parseInt(m,10)-1] || m) + ' ' + y;
}

/* ══════════════════════════════════
   CHART HELPERS
══════════════════════════════════ */
const COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'];

Chart.defaults.font.family = 'Inter';
Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#94a3b8';

function getChartDefaults() {
  const style = getComputedStyle(document.documentElement);
  return {
    grid: style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)',
    text: style.getPropertyValue('--chart-text').trim() || '#94a3b8',
  };
}

function makeChart(id, config) {
  if (CHARTS[id]) { CHARTS[id].destroy(); }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  CHARTS[id] = new Chart(canvas, config);
  return CHARTS[id];
}

function barConfig(labels, datasets, opts) {
  const d = getChartDefaults();
  if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
  return {
    type: 'bar',
    plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    data: { labels, datasets },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: d.text, font: { size: 11 }, boxWidth: 12, padding: 12 } },
        datalabels: window.ChartDataLabels ? {
          anchor: 'end', align: 'top',
          color: '#ffffff',
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 5, right: 5 },
          font: { size: 11, weight: '700' },
          formatter: function(v){ return v > 0 ? v : ''; },
          display: function(ctx){ return ctx.dataset.data[ctx.dataIndex] > 0; }
        } : false,
      },
      scales: {
        x: { ticks: { color: d.text, font: { size: 10 } }, grid: { color: d.grid } },
        y: { ticks: { color: d.text, font: { size: 10 } }, grid: { color: d.grid }, beginAtZero: true },
      }
    }, opts || {}),
  };
}

function lineConfig(labels, datasets, opts) {
  const cfg = barConfig(labels, datasets, opts);
  cfg.type = 'line';
  return cfg;
}

function doughnutConfig(labels, values, colors) {
  const d = getChartDefaults();
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors || COLORS, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: d.text, font: { size: 11 }, boxWidth: 10, padding: 10 } }
      }
    }
  };
}

function horizontalBarConfig(labels, values, color, opts) {
  const d = getChartDefaults();
  if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
  return {
    type: 'bar',
    plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: color || '#3b82f6', borderRadius: 4, barThickness: 18 }]
    },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        datalabels: window.ChartDataLabels ? {
          anchor: 'end', align: 'right',
          color: '#ffffff',
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          font: { size: 12, weight: '700' },
          formatter: function(v){ return v; },
        } : false,
      },
      scales: {
        x: { ticks: { color: d.text, font: { size: 10 } }, grid: { color: d.grid }, beginAtZero: true },
        y: { ticks: { color: d.text, font: { size: 10 } }, grid: { color: 'transparent' } },
      }
    }, opts || {}),
  };
}

/* ── Count helpers ── */
function countBy(arr, key) {
  const m = {};
  arr.forEach(function (r) { const v = r[key] || 'N/A'; m[v] = (m[v] || 0) + 1; });
  return m;
}

function countByDay(arr) {
  const m = {};
  arr.forEach(function (r) {
    const d = r.fecha ? r.fecha.substring(0, 10) : 'N/A';
    m[d] = (m[d] || 0) + 1;
  });
  return m;
}

function topN(obj, n) {
  return Object.entries(obj).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n || 10);
}

function filterByMonth(arr, mes) {
  if (!mes) return arr;
  return arr.filter(function (r) { return r.fecha && r.fecha.startsWith(mes); });
}

/* ══════════════════════════════════
   isEnRevIT — equivalente a v1
══════════════════════════════════ */
function isEnRevIT(r) {
  var s = norm(r.ops || '').replace(/[\s\-]/g, '');
  return s === 'enrevisioncoit' || s.includes('enrevisioncoit');
}

/* ══════════════════════════════════
   OVERVIEW TAB
══════════════════════════════════ */
function renderOverview() {
  var enRevRecs = RECORDS.filter(isEnRevIT);
  var total     = enRevRecs.length;

  var penCount = {};
  enRevRecs.forEach(function(r){ var p = r.pen || ''; penCount[p] = (penCount[p]||0)+1; });
  var sol  = penCount['Operaciones Solucionado'] || 0;
  var cont = penCount['Continuidad'] || 0;
  var rev  = penCount['Operaciones Revision/Configuracion'] || 0;

  // KPIs
  setKPI('kpi-total-orders', total);
  setKPI('kpi-liberadas',    sol);
  setKPI('kpi-kronotime',    cont);
  setKPI('kpi-sinstock',     rev);

  function pct(v) { return total ? ' (' + (v/total*100).toFixed(1) + '%)' : ''; }
  setKPITrend('kpi-pct-sol',  pct(sol));
  setKPITrend('kpi-pct-cont', pct(cont));
  setKPITrend('kpi-pct-rev',  pct(rev));

  // Barra progreso
  renderProgBar(total, sol, cont, rev);

  // Tabla dependencias
  renderDependenciasTable(enRevRecs);

  // Gráficas
  renderTendenciaDiaria();
  renderOverviewIssues();
  renderMarcaDia();

  // Rellenar selects de mes y marca para Marca/Día
  buildMarcaMesSelects();
}

function setKPI(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'number' ? val.toLocaleString('es-CO') : val;
}
function setKPITrend(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

/* ── Barra de progreso ── */
function renderProgBar(total, sol, cont, rev) {
  function setWidth(id, v) {
    var el = document.getElementById(id);
    if (!el) return;
    var p = total ? (v/total*100).toFixed(1) : 0;
    el.style.width = p + '%';
    el.textContent = (v > 0 && parseFloat(p) > 5) ? v : '';
  }
  setWidth('ov-ps-sol',  sol);
  setWidth('ov-ps-cont', cont);
  setWidth('ov-ps-rev',  rev);

  function lbl(id, label, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = label + ' (' + v.toLocaleString('es-CO') + ')';
  }
  lbl('ov-lbl-sol',  'Operaciones Solucionado', sol);
  lbl('ov-lbl-cont', 'Continuidad',             cont);
  lbl('ov-lbl-rev',  'Op. Rev./Config.',         rev);
}

/* ── Tabla Dependencias — Últimos 15 días ── */
function renderDependenciasTable(enRevRecs) {
  // Filter: isEnRevIT && pen === 'Continuidad'
  var recsNotif = enRevRecs.filter(function(r){ return r.pen === 'Continuidad' && r.fn; });

  // Fechas de notificación únicas, ordenadas
  var dateRe = /^\d{4}-\d{2}-\d{2}$/;
  var allFn  = [...new Set(recsNotif.map(function(r){ return r.fn; }).filter(function(f){ return dateRe.test(f); }))].sort();
  var ult15  = allFn.slice(-15);

  if (ult15.length > 0) {
    var rng = document.getElementById('ov-tabla-rango');
    if (rng) rng.textContent = ' — ' + ult15[0].slice(5).replace('-','/') + ' al ' + ult15[ult15.length-1].slice(5).replace('-','/');
  }

  // Agrupar por com → fn → count
  var tblData  = {};
  var histData = {};
  recsNotif.forEach(function(r) {
    if (!r.com) return;
    if (!tblData[r.com])  tblData[r.com]  = {};
    tblData[r.com][r.fn] = (tblData[r.com][r.fn] || 0) + 1;
    histData[r.com]       = (histData[r.com] || 0) + 1;
  });

  // Comentarios ordenados por total histórico
  var coms = Object.keys(tblData).sort(function(a,b){ return (histData[b]||0)-(histData[a]||0); });

  // Thead
  var thead = document.getElementById('ov-tblHead');
  if (!thead) return;
  var thHtml = '<tr><th style="min-width:180px;text-align:left">Comentario continuidad</th>';
  ult15.forEach(function(f){ thHtml += '<th style="text-align:center">' + f.slice(5).replace('-','/') + '</th>'; });
  thHtml += '<th class="dep-tot15" style="text-align:center">Tot 15d</th><th class="dep-toth" style="text-align:center">Tot Hist.</th></tr>';
  thead.innerHTML = thHtml;

  // Tbody — resaltar máximo de cada fila en rojo
  var tbody = document.getElementById('ov-tblBody');
  if (!tbody) return;
  var bodyHtml = '';
  coms.forEach(function(com) {
    var rowVals = ult15.map(function(f){ return tblData[com][f] || 0; });
    var tot15   = rowVals.reduce(function(a,b){ return a+b; }, 0);
    var maxVal  = Math.max.apply(null, rowVals.filter(function(v){ return v > 0; })) || 0;

    bodyHtml += '<tr><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + com + '">' + com + '</td>';
    rowVals.forEach(function(v) {
      if (v === 0)       bodyHtml += '<td class="dep-zero" style="text-align:center">·</td>';
      else if (v===maxVal && maxVal>1) bodyHtml += '<td class="dep-max"  style="text-align:center">' + v + '</td>';
      else               bodyHtml += '<td class="dep-val"  style="text-align:center">' + v + '</td>';
    });
    bodyHtml += '<td class="dep-tot15" style="text-align:center">' + tot15 + '</td>';
    bodyHtml += '<td class="dep-toth"  style="text-align:center">' + (histData[com]||0) + '</td>';
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml || '<tr><td colspan="20" style="text-align:center;color:var(--text-muted);padding:20px">Sin registros de Continuidad</td></tr>';

  // Tfoot — fila de totales por columna
  var tfoot = document.getElementById('ov-tblFoot');
  if (tfoot) {
    // Sumar cada fecha de los últimos 15 días
    var colTotals = ult15.map(function(f){
      return coms.reduce(function(acc, com){ return acc + (tblData[com][f] || 0); }, 0);
    });
    var grandTot15 = colTotals.reduce(function(a,b){ return a+b; }, 0);
    var grandHist  = coms.reduce(function(acc, com){ return acc + (histData[com]||0); }, 0);

    var tfHtml = '<tr style="font-weight:700;background:var(--bg-card);border-top:2px solid var(--border)">';
    tfHtml += '<td style="text-align:left;color:var(--text-primary)">Total</td>';
    colTotals.forEach(function(v){
      tfHtml += '<td style="text-align:center;color:var(--blue)">' + (v || '·') + '</td>';
    });
    tfHtml += '<td class="dep-tot15" style="text-align:center">' + grandTot15 + '</td>';
    tfHtml += '<td class="dep-toth"  style="text-align:center">' + grandHist  + '</td>';
    tfHtml += '</tr>';
    tfoot.innerHTML = tfHtml;
  }
}

/* ── Estado global de fecha seleccionada ── */
var selectedDate = '';

function onDatePickerChange(val) {
  var picker = document.getElementById('ov-date-picker');
  if (typeof val === 'string') {
    selectedDate = val;
    if (picker) picker.value = val;
  } else {
    selectedDate = picker ? picker.value : '';
  }
  renderTendenciaDiaria();
  renderEstadoDia(selectedDate);
}

/* ── Tendencia diaria (línea con valores en picos) ── */
function renderTendenciaDiaria() {
  // Mes actual, días 1 al hoy (igual que V1)
  var ordPorDia = {};
  RECORDS.forEach(function(r){
    if (r.fn && /^\d{4}-\d{2}-\d{2}$/.test(r.fn)) ordPorDia[r.fn] = (ordPorDia[r.fn]||0)+1;
  });
  var hoy       = new Date();
  var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
  var diaHoy    = mesActual + '-' + String(hoy.getDate()).padStart(2,'0');
  var dias      = [];
  for (var _d = 1; _d <= hoy.getDate(); _d++) {
    dias.push(mesActual + '-' + String(_d).padStart(2,'0'));
  }
  var vals = dias.map(function(d){ return ordPorDia[d] || 0; });
  var d    = getChartDefaults();

  // Registrar plugin datalabels si está disponible
  if (window.ChartDataLabels) {
    Chart.register(window.ChartDataLabels);
  }

  // Puntos: resaltar día seleccionado o día de hoy
  var highlightDate = selectedDate || diaHoy;
  var pointColors = dias.map(function(dia){
    return dia === highlightDate ? '#ef4444' : '#3b82f6';
  });
  var pointRadii = dias.map(function(dia){
    return dia === highlightDate ? 7 : 3;
  });

  makeChart('chartOverviewDia', {
    type: 'line',
    plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    data: {
      labels: dias.map(function(dia){ return dia.slice(8)+'/'+dia.slice(5,7); }),
      datasets: [{
        label: 'Órdenes',
        data: vals,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.07)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: pointRadii,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: function(items){ return dias[items[0].dataIndex]; } } },
        datalabels: window.ChartDataLabels ? {
          align: 'top',
          anchor: 'end',
          color: '#ffffff',
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 5, right: 5 },
          font: { size: 10, weight: '700' },
          formatter: function(v){ return v > 0 ? v : ''; },
          display: function(ctx){ return ctx.dataset.data[ctx.dataIndex] > 0; }
        } : false,
      },
      scales: {
        x: { ticks: { color: d.text, font: { size: 9 }, maxTicksLimit: 22 }, grid: { color: d.grid } },
        y: { ticks: { color: d.text, font: { size: 10 } }, grid: { color: d.grid }, beginAtZero: true },
      },
      onClick: function(evt, elements) {
        if (elements && elements.length > 0) {
          var fecha = dias[elements[0].index];
          onDatePickerChange(selectedDate === fecha ? '' : fecha);
        }
      },
      onHover: function(evt){ evt.native.target.style.cursor = 'pointer'; }
    }
  });

  if (!selectedDate && dias.length > 0) {
    renderEstadoDia(diaHoy);
  } else {
    renderEstadoDia(selectedDate);
  }
}

/* ── Estado del Día ── */
function renderEstadoDia(fecha) {
  var badge = document.getElementById('ov-dia-badge');
  var total = document.getElementById('ov-dia-total');
  var rows  = document.getElementById('ov-dia-rows');
  if (!badge || !total || !rows) return;

  if (!fecha) {
    badge.textContent = '—';
    total.textContent = '—';
    rows.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Selecciona un día en la gráfica</span>';
    return;
  }

  var recs = RECORDS.filter(function(r){ return r.fecha === fecha; });
  badge.textContent = fecha.slice(8) + '/' + fecha.slice(5,7) + '/' + fecha.slice(0,4);
  total.textContent = recs.length.toLocaleString('es-CO');

  // Agrupar por Estado Caso (detalle)
  var por_com = {};
  recs.forEach(function(r){ var k = r.detalle || r.com || 'Sin estado'; por_com[k] = (por_com[k]||0)+1; });
  var top = topN(por_com, 8);

  var colores = ['var(--blue)','var(--green)','var(--amber)','var(--red)','var(--purple)','var(--blue)','var(--green)','var(--amber)'];

  rows.innerHTML = top.map(function(t, i){
    var pct = recs.length ? (t[1]/recs.length*100).toFixed(0) : 0;
    return '<div style="display:flex;flex-direction:column;gap:3px">' +
      '<div style="display:flex;justify-content:space-between;font-size:12px">' +
        '<span style="color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">' + t[0] + '</span>' +
        '<strong style="color:var(--text-primary)">' + t[1] + '</strong>' +
      '</div>' +
      '<div style="height:5px;background:var(--bg-base);border-radius:3px">' +
        '<div style="height:100%;width:' + pct + '%;background:' + colores[i%colores.length] + ';border-radius:3px;transition:width .4s ease"></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ── Top 10 Issues (Estado Caso) ── */
function renderOverviewIssues() {
  var selIssues = document.getElementById('sel-mes-issues');
  var mes   = selIssues ? selIssues.value : getCurrentMes();
  if (!mes) mes = getCurrentMes();
  var marca = (document.getElementById('sel-marca-overview')?.value || '').trim();

  var recs = RECORDS.filter(function(r){ return r.fecha && r.fecha.startsWith(mes); });
  if (marca) recs = recs.filter(function(r){ return r.marca === marca; });

  var counts = {};
  recs.forEach(function(r){ var k = r.detalle || 'Sin estado'; counts[k]=(counts[k]||0)+1; });
  var top = topN(counts, 10);

  makeChart('chartIssues', horizontalBarConfig(
    top.map(function(t){ return t[0]; }),
    top.map(function(t){ return t[1]; }),
    COLORS
  ));
}

/* ── Órdenes por Marca / Día ── */
function buildMarcaMesSelects() {
  var anoActual = new Date().getFullYear().toString();
  var meses  = getMonths(RECORDS).filter(function(m){ return m.startsWith(anoActual); });
  var marcas = [...new Set(RECORDS.map(function(r){ return r.marca; }).filter(Boolean))].sort();
  var mesPres = getCurrentMes();

  // Select mes Marca/Día
  var selMes = document.getElementById('sel-mes-overview');
  if (selMes) {
    var curMes = selMes.value || mesPres;
    selMes.innerHTML = '';
    meses.forEach(function(m){ var o=document.createElement('option'); o.value=m; o.textContent=fmtMonth(m); selMes.appendChild(o); });
    selMes.value = (meses.indexOf(curMes) !== -1) ? curMes : (meses[0] || '');
  }

  // Select marca
  var selMarca = document.getElementById('sel-marca-overview');
  if (selMarca) {
    var curMarca = selMarca.value;
    selMarca.innerHTML = '<option value="">Todas las marcas</option>';
    marcas.forEach(function(m){ var o=document.createElement('option'); o.value=m; o.textContent=m; selMarca.appendChild(o); });
    if (curMarca) selMarca.value = curMarca;
  }

  // Select mes Issues
  var selIssues = document.getElementById('sel-mes-issues');
  if (selIssues) {
    var curIssues = selIssues.value || mesPres;
    selIssues.innerHTML = '';
    meses.forEach(function(m){ var o=document.createElement('option'); o.value=m; o.textContent=fmtMonth(m); selIssues.appendChild(o); });
    selIssues.value = (meses.indexOf(curIssues) !== -1) ? curIssues : (meses[0] || '');
  }
}

function renderMarcaDia() {
  var mes   = (document.getElementById('sel-mes-overview')?.value  || '').trim();
  var marca = (document.getElementById('sel-marca-overview')?.value || '').trim();

  // Si no hay mes → usar el más reciente (por r.fn igual que V1)
  var mesFinal = mes;
  if (!mesFinal) {
    var _meses = [...new Set(RECORDS.map(function(r){ return r.fn ? r.fn.slice(0,7) : ''; }).filter(Boolean))].sort().reverse();
    mesFinal = _meses[0] || '';
  }

  // Rango: día 1 al último del mes, pero cap al día de hoy (igual que V1)
  var hoy    = new Date();
  var hoyISO = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') + '-' + String(hoy.getDate()).padStart(2,'0');
  var dias   = [];
  if (mesFinal) {
    var yr  = parseInt(mesFinal.slice(0,4), 10);
    var mo  = parseInt(mesFinal.slice(5,7), 10);
    var finMes = mesFinal + '-' + String(new Date(yr, mo, 0).getDate()).padStart(2,'0');
    var fin    = finMes < hoyISO ? finMes : hoyISO;
    var cur = new Date(mesFinal + '-01T00:00:00');
    var end = new Date(fin   + 'T00:00:00');
    while (cur <= end) {
      dias.push(cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0'));
      cur.setDate(cur.getDate()+1);
    }
  }

  // Contar por r.fn (igual que V1)
  var byDay = {};
  RECORDS.forEach(function(r){
    if (r.fn && /^\d{4}-\d{2}-\d{2}$/.test(r.fn) && r.fn.startsWith(mesFinal)) {
      if (!marca || r.marca === marca) byDay[r.fn] = (byDay[r.fn]||0)+1;
    }
  });

  var vals   = dias.map(function(dia){ return byDay[dia] || 0; });
  var labels = dias.map(function(dia){ return dia.slice(8); }); // número de día

  var d = getChartDefaults();
  makeChart('chartMarcaDia', barConfig(
    labels,
    [{ label: (marca || 'Todas las marcas') + ' — ' + fmtMonth(mesFinal),
       data: vals, backgroundColor: '#3b82f6', borderRadius: 4, barThickness: 14 }]
  ));
}

/* ── Por País ── */
function renderPaisChart() {
  var m = countBy(RECORDS, 'pais');
  var top = topN(m, 8);
  makeChart('chartPais', doughnutConfig(top.map(function(t){ return t[0]; }), top.map(function(t){ return t[1]; })));
}

/* ══════════════════════════════════
   SIN STOCK TAB
══════════════════════════════════ */
let SS_PAGE = 0;
const SS_PAGE_SIZE = 50;
let SS_FILTERED = [];

function renderSinStock() {
  const mes   = document.getElementById('ss-mes')?.value || '';
  const pais  = document.getElementById('ss-pais')?.value || '';
  const marca = document.getElementById('ss-marca')?.value || '';

  // ── Consolidado mensual (sin filtro de mes, aplica país/marca si están) ──
  var recsAll = RECORDS_SS;
  if (pais)  recsAll = recsAll.filter(function(r){ return r.pais  === pais;  });
  if (marca) recsAll = recsAll.filter(function(r){ return r.marca === marca; });

  var mesRe = /^\d{4}-\d{2}$/;
  var byMes = {};
  recsAll.forEach(function(r){
    var m = (r.fecha || '').slice(0, 7);
    if (mesRe.test(m)) byMes[m] = (byMes[m] || 0) + 1;
  });
  var mesesAll = Object.keys(byMes).sort();
  if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
  makeChart('chartSSMes', {
    type: 'bar',
    plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    data: {
      labels: mesesAll.map(fmtMonth),
      datasets: [{
        label: 'Sin Stock',
        data: mesesAll.map(function(m){ return byMes[m]; }),
        backgroundColor: mesesAll.map(function(m){ return m === mes ? '#ef4444' : 'rgba(239,68,68,0.55)'; }),
        borderRadius: 5, barThickness: 32,
      }]
    },
    options: (function(){
      var d = getChartDefaults();
      return {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: window.ChartDataLabels ? {
            anchor: 'end', align: 'top',
            color: '#ffffff', backgroundColor: '#ef4444',
            borderRadius: 4, padding: { top:2, bottom:2, left:5, right:5 },
            font: { size: 12, weight: '700' },
            formatter: function(v){ return v > 0 ? v : ''; },
          } : false,
        },
        scales: {
          x: { ticks: { color: d.text, font: { size: 11 } }, grid: { color: d.grid } },
          y: { ticks: { color: d.text }, grid: { color: d.grid }, beginAtZero: true },
        },
        onClick: function(evt, elements) {
          if (elements && elements.length > 0) {
            var selM = mesesAll[elements[0].index];
            var el = document.getElementById('ss-mes');
            if (el) { el.value = (el.value === selM) ? '' : selM; renderSinStock(); }
          }
        },
        onHover: function(evt){ evt.native.target.style.cursor = 'pointer'; }
      };
    })()
  });

  // ── Filtros por mes para detalle ──
  let recs = filterByMonth(RECORDS_SS, mes);
  if (pais)  recs = recs.filter(function (r) { return r.pais  === pais; });
  if (marca) recs = recs.filter(function (r) { return r.marca === marca; });

  // Populate selects
  const allSS = filterByMonth(RECORDS_SS, mes);
  updateSelect('ss-pais',  [...new Set(allSS.map(function(r){return r.pais; }))].sort(), pais, 'Todos los países');
  updateSelect('ss-marca', [...new Set(allSS.map(function(r){return r.marca;}))].sort(), marca, 'Todas las marcas');

  document.getElementById('ss-count').textContent = recs.length;
  setKPI('ss-kpi-total',  recs.length);
  setKPI('ss-kpi-marcas', new Set(recs.map(function(r){return r.marca;})).size);
  setKPI('ss-kpi-paises', new Set(recs.map(function(r){return r.pais; })).size);

  // Chart: por día (del mes seleccionado)
  const byDay = countByDay(recs);
  const days  = Object.keys(byDay).sort();
  makeChart('chartSSDia', barConfig(
    days.map(function(d){return d.substring(8);}),
    [{ label: 'Sin Stock', data: days.map(function(d){return byDay[d];}), backgroundColor: '#ef4444', borderRadius: 4, barThickness: 11 }]
  ));

  // Chart: por marca
  const topMarca = topN(countBy(recs, 'marca'), 10);
  makeChart('chartSSMarca', horizontalBarConfig(
    topMarca.map(function(t){return t[0];}),
    topMarca.map(function(t){return t[1];}),
    '#3b82f6'
  ));

  // Table
  SS_FILTERED = recs;
  SS_PAGE = 0;
  renderSSTable();
}

function updateSelect(id, values, current, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">' + placeholder + '</option>';
  values.forEach(function (v) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    if (v === current) opt.selected = true;
    el.appendChild(opt);
  });
}

function renderSSTable() {
  const search = (document.getElementById('ss-search')?.value || '').toLowerCase();
  let rows = SS_FILTERED;
  if (search) {
    rows = rows.filter(function (r) {
      return Object.values(r).some(function(v){ return v.toLowerCase().includes(search); });
    });
  }
  const total = rows.length;
  const page  = rows.slice(SS_PAGE * SS_PAGE_SIZE, (SS_PAGE + 1) * SS_PAGE_SIZE);
  const tbody = document.getElementById('ss-tbody');
  if (!tbody) return;
  tbody.innerHTML = page.map(function (r) {
    return '<tr><td>' + (r.fecha||'—') + '</td><td>' + (r.marca||'—') + '</td><td>' + (r.pais||'—') + '</td><td>' + statusBadge(r.estado) + '</td><td class="text-muted">' + (r.ov||'—') + '</td></tr>';
  }).join('');
  const pg = document.getElementById('ss-pagination');
  if (pg) pg.textContent = 'Mostrando ' + Math.min((SS_PAGE+1)*SS_PAGE_SIZE, total) + ' de ' + total;
}

function filterSSTable() { SS_PAGE = 0; renderSSTable(); }

/* ══════════════════════════════════
   KRONOTIME TAB
══════════════════════════════════ */
function renderKrono() {
  const mes = document.getElementById('kr-mes')?.value || '';
  const recs = filterByMonth(RECORDS_KR, mes);

  document.getElementById('kr-count').textContent = recs.length;
  const activos = recs.filter(function(r){ return !norm(r.estado).includes('cerrada') && !norm(r.estado).includes('resuelta'); });
  const resueltos = recs.length - activos.length;

  setKPI('kr-kpi-total',    recs.length);
  setKPI('kr-kpi-activos',  activos.length);
  setKPI('kr-kpi-resueltos',resueltos);

  // Chart: por día
  const byDay = countByDay(recs);
  const days  = Object.keys(byDay).sort();
  makeChart('chartKronoDia', barConfig(
    days.map(function(d){return d.substring(8);}),
    [{ label: 'Escalados', data: days.map(function(d){return byDay[d];}), backgroundColor: '#f59e0b', borderRadius: 4, barThickness: 11 }]
  ));

  // Chart: por estado
  const est = countBy(recs, 'estado');
  const estTop = topN(est, 6);
  makeChart('chartKronoEst', doughnutConfig(
    estTop.map(function(t){return t[0];}),
    estTop.map(function(t){return t[1];}),
    ['#f59e0b','#3b82f6','#22c55e','#ef4444','#a855f7','#06b6d4']
  ));

  // Table
  const tbody = document.getElementById('kr-tbody');
  if (!tbody) return;
  tbody.innerHTML = recs.slice(0, 100).map(function(r, i) {
    const dias = calcDias(r.fecha);
    return '<tr><td class="text-blue">#' + (i+1) + '</td><td>' + (r.marca||'—') + ' / ' + (r.pais||'—') + '</td><td>' + (r.fecha||'—') + '</td><td>' + (dias >= 0 ? dias : '—') + '</td><td>' + statusBadge(r.estado) + '</td></tr>';
  }).join('');
}

function calcDias(fecha) {
  if (!fecha) return -1;
  const d = new Date(fecha);
  if (isNaN(d)) return -1;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* ══════════════════════════════════
   MCI TAB
══════════════════════════════════ */
function renderMCI() {
  const mes = document.getElementById('mci-mes')?.value || '';
  const ing = RECORDS_MCI_ING.filter(function(r){ return !mes || (r.fecha||'').startsWith(mes); });
  const inc = filterByMonth(RECORDS, mes);

  const totalIng = ing.length;
  const totalInc = inc.length;
  const pct = totalIng > 0 ? ((totalInc / totalIng) * 100).toFixed(1) + '%' : '—';

  setKPI('mci-kpi-ing', totalIng);
  setKPI('mci-kpi-inc', totalInc);
  setKPI('mci-kpi-pct', pct);

  // Chart
  const ingByDay = {};
  ing.forEach(function(r){ const d = (r.fecha||'').substring(0,10); ingByDay[d] = (ingByDay[d]||0)+1; });
  const incByDay = countByDay(inc);
  const allDays  = [...new Set([...Object.keys(ingByDay), ...Object.keys(incByDay)])].sort();

  makeChart('chartMCI', lineConfig(
    allDays.map(function(d){return d.substring(8);}),
    [
      { label: 'Ingresadas', data: allDays.map(function(d){return ingByDay[d]||0;}), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Incidentadas', data: allDays.map(function(d){return incByDay[d]||0;}), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
    ]
  ));
}

/* ══════════════════════════════════
   JIRAS TAB
══════════════════════════════════ */
function renderJiras() {
  const search = (document.getElementById('jira-search')?.value || '').toLowerCase();
  const estado = document.getElementById('jira-estado')?.value || '';

  let recs = RECORDS_JIRAS;

  // Populate estado select
  const estados = [...new Set(RECORDS_JIRAS.map(function(r){return r.estado||'';}))].sort();
  updateSelect('jira-estado', estados, estado, 'Todos los estados');

  if (search) recs = recs.filter(function(r){ return JSON.stringify(r).toLowerCase().includes(search); });
  if (estado) recs = recs.filter(function(r){ return r.estado === estado; });

  document.getElementById('jira-count').textContent = recs.length;

  const tbody = document.getElementById('jira-tbody');
  if (!tbody) return;
  tbody.innerHTML = recs.slice(0, 200).map(function(r) {
    const dias = calcDias(r.fecha);
    return '<tr><td class="text-blue">' + (r.ticket||r.id||'—') + '</td><td>' + (r.marca||'—') + ' / ' + (r.pais||'—') + '</td><td>' + (r.fecha||'—') + '</td><td>' + (dias>=0?dias:'—') + '</td><td>' + statusBadge(r.estado) + '</td><td class="text-muted">' + (r.pendiente||'—') + '</td></tr>';
  }).join('');
}

/* ══════════════════════════════════
   HORARIOS JBL CHAT
══════════════════════════════════ */
const JBL_HORARIOS = {
  colombia: { precio: '10:04 AM', stock: 'Cada 15 minutos', zona: 'COT (UTC-5)' },
  chile:    { precio: '10:04 AM', stock: 'Cada 15 minutos', zona: 'CLT (UTC-3)' },
  mexico:   { precio: '10:04 AM', stock: 'Cada 15 minutos', zona: 'CST (UTC-6)' },
  peru:     { precio: '10:04 AM', stock: 'Cada 15 minutos', zona: 'PET (UTC-5)' },
};

const JBL_RESPONSES = [
  { keys: ['colombia','col'], fn: function(){ return mkResp('Colombia', JBL_HORARIOS.colombia); }},
  { keys: ['chile'],          fn: function(){ return mkResp('Chile',    JBL_HORARIOS.chile); }},
  { keys: ['mexico','méxico'],fn: function(){ return mkResp('México',   JBL_HORARIOS.mexico); }},
  { keys: ['peru','perú'],    fn: function(){ return mkResp('Perú',     JBL_HORARIOS.peru); }},
  { keys: ['precio','precios'], fn: function(){
    return 'Los precios en todos los países se actualizan a las <strong>10:04 AM</strong> hora local de cada país.';
  }},
  { keys: ['stock','inventario'], fn: function(){
    return 'El stock se actualiza <strong>cada 15 minutos</strong> para todos los países (Colombia, Chile, México, Perú).';
  }},
  { keys: ['pais','país','todos'], fn: function(){
    return '📋 Resumen de todos los países:<br>' +
      Object.entries(JBL_HORARIOS).map(function(e){ return '• <strong>'+cap(e[0])+'</strong>: precio 10:04 AM, stock c/15 min ('+e[1].zona+')'; }).join('<br>');
  }},
];

function mkResp(pais, h) {
  return '🌎 <strong>' + pais + '</strong><br>• Precio frontal: <strong>' + h.precio + '</strong><br>• Stock frontal: <strong>' + h.stock + '</strong><br>• Zona horaria: ' + h.zona;
}
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function jblSend() {
  const input = document.getElementById('jbl-input');
  const msg = (input.value || '').trim();
  if (!msg) return;
  input.value = '';

  appendChat('user', msg);

  const q = norm(msg);
  let response = null;
  for (let i = 0; i < JBL_RESPONSES.length; i++) {
    if (JBL_RESPONSES[i].keys.some(function(k){ return q.includes(k); })) {
      response = JBL_RESPONSES[i].fn();
      break;
    }
  }
  if (!response) {
    response = '🤔 No encontré información sobre eso. Puedes preguntarme por <strong>precios</strong> o <strong>stock</strong> de un país específico (Colombia, Chile, México, Perú).';
  }

  setTimeout(function(){ appendChat('bot', response); }, 400);
}

function appendChat(role, html) {
  const h = document.getElementById('jbl-history');
  if (!h) return;
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg--' + (role === 'bot' ? 'bot' : 'user');
  div.innerHTML = html;
  h.appendChild(div);
  h.scrollTop = h.scrollHeight;
}

/* ══════════════════════════════════
   NAVIGATION
══════════════════════════════════ */
const TAB_TITLES = {
  overview: 'Resumen General',
  sinstock: 'Sin Stock',
  kronotime: 'Kronotime',
  mci: 'MCI',
  jiras: 'Gestión de Jiras',
  horarios: 'Horarios JBL',
};

function switchTab(tab, el) {
  activeTab = tab;

  // Content
  document.querySelectorAll('.tab-content').forEach(function(s){
    s.classList.remove('active');
  });
  const sec = document.getElementById('tab-' + tab);
  if (sec) sec.classList.add('active');

  // Nav
  document.querySelectorAll('.nav-item').forEach(function(a){
    a.classList.toggle('active', a.dataset.tab === tab);
  });

  // Title
  document.getElementById('pageTitle').textContent = TAB_TITLES[tab] || tab;

  // Re-render charts (Canvas needs to be visible)
  if (tab === 'overview')   { renderOverview(); }
  if (tab === 'sinstock')   { renderSinStock(); }
  if (tab === 'kronotime')  { renderKrono(); }
  if (tab === 'mci')        { renderMCI(); }
  if (tab === 'jiras')      { renderJiras(); }

  // Close sidebar on mobile
  if (window.innerWidth < 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

/* ══════════════════════════════════
   SIDEBAR TOGGLE
══════════════════════════════════ */
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const mc = document.querySelector('.main-content');
  if (window.innerWidth < 900) {
    sb.classList.toggle('open');
  } else {
    sb.classList.toggle('collapsed');
    mc.classList.toggle('expanded');
  }
}

/* ══════════════════════════════════
   THEME TOGGLE
══════════════════════════════════ */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('icon-sun').style.display  = isDark ? 'block' : 'none';
  document.getElementById('icon-moon').style.display = isDark ? 'none' : 'block';
  document.getElementById('theme-label').textContent = isDark ? 'Modo oscuro' : 'Modo claro';
  // Update chart colors
  Chart.defaults.color = getChartDefaults().text;
  renderAll();
}

/* ══════════════════════════════════
   BADGE HELPER
══════════════════════════════════ */
function statusBadge(estado) {
  const e = norm(estado || '');
  if (e.includes('liberada') || e.includes('cerrada') || e.includes('resuelta'))
    return '<span class="badge badge-green">' + (estado||'—') + '</span>';
  if (e.includes('pend') || e.includes('espera'))
    return '<span class="badge badge-amber">' + (estado||'—') + '</span>';
  if (e.includes('cancelada') || e.includes('rechazada'))
    return '<span class="badge badge-red">' + (estado||'—') + '</span>';
  if (e.includes('proceso') || e.includes('revision'))
    return '<span class="badge badge-blue">' + (estado||'—') + '</span>';
  return '<span class="badge badge-gray">' + (estado||'—') + '</span>';
}

/* ══════════════════════════════════
   DEMO DATA (fallback local dev)
══════════════════════════════════ */
function buildDemoData() {
  const meses  = ['2026-06','2026-07','2026-08','2026-09'];
  const marcas = ['JBL','Harman','Samsung','AKG','Infinity','Dockers','Crocs','Lacoste'];
  const paises = ['Colombia','Chile','México','Perú','Guatemala'];
  const pens   = ['Operaciones Solucionado','Continuidad','Operaciones Revision/Configuracion'];
  const coms_ss = ['Sin stock','Sin Stock ','SIN STOCK EN BODEGA'];
  const coms_kr = ['Escalado con Kronotime'];
  const coms_other = ['Liberada','Orden cancelada','Escalado con Customer Integration','Escalado operaciones','Escalado con Driver','Jira duplicado'];

  function rnd(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function rndDate(m) {
    const d = new Date(m+'-01');
    d.setDate(Math.floor(Math.random()*25)+1);
    return d.toISOString().substring(0,10);
  }
  // fn es ~1-3 días después de fecha
  function rndFn(fo) {
    const d = new Date(fo);
    d.setDate(d.getDate() + Math.floor(Math.random()*3)+1);
    return d.toISOString().substring(0,10);
  }

  const inc = [];
  // 999 sin stock
  for (let i=0;i<999;i++) {
    const fo = rndDate(rnd(meses));
    inc.push({ fecha:fo, fn:rndFn(fo), marca:rnd(marcas), pais:rnd(paises), estado:rnd(coms_ss), com:rnd(coms_ss), ops:'En revision CO - IT', pen:rnd(pens), ov:'OV'+Math.floor(Math.random()*99999) });
  }
  // 98 kronotime
  for (let i=0;i<98;i++) {
    const fo = rndDate(rnd(meses));
    inc.push({ fecha:fo, fn:rndFn(fo), marca:rnd(marcas), pais:rnd(paises), estado:'Escalado con Kronotime', com:'Escalado con Kronotime', ops:'En revision CO - IT', pen:rnd(pens), ov:'OV'+Math.floor(Math.random()*99999) });
  }
  // 4000 otros (En revision CO-IT con varios estados)
  const coms_rev = ['Liberada','Orden cancelada','Escalado con Customer Integration','Escalado operaciones','Escalado con Driver','Jira duplicado','Escalado con IXLogistics','Marcha blanca'];
  for (let i=0;i<4000;i++) {
    const fo = rndDate(rnd(meses));
    inc.push({ fecha:fo, fn:rndFn(fo), marca:rnd(marcas), pais:rnd(paises), estado:rnd(coms_rev), com:rnd(coms_rev), ops:'En revision CO - IT', pen:rnd(pens), ov:'OV'+Math.floor(Math.random()*99999) });
  }
  // 500 con otros ops (no en revisión)
  for (let i=0;i<500;i++) {
    const fo = rndDate(rnd(meses));
    inc.push({ fecha:fo, fn:rndFn(fo), marca:rnd(marcas), pais:rnd(paises), estado:rnd(coms_other), com:rnd(coms_other), ops:'Facturada', pen:'Operaciones Solucionado', ov:'OV'+Math.floor(Math.random()*99999) });
  }

  const ing = [];
  for (let i=0;i<3000;i++) ing.push({ fecha: rndDate(rnd(meses)) });

  const jiras = [];
  for (let i=0;i<50;i++) {
    const m = rnd(meses); const fo = rndDate(m);
    jiras.push({ ticket:'ITHD-'+String(94000+i), marca:rnd(marcas), pais:rnd(paises), fecha:fo, estado:rnd(['Abierto','En progreso','Esperando respuesta','Resuelto']), pendiente:rnd(['IT','Proveedor','Cliente','—']) });
  }

  return { generatedAt: new Date().toISOString(), source:'demo', incidencias: inc, ingresadas: ing, jiras: jiras };
}
