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
  // Forzar modo claro siempre al cargar
  document.documentElement.setAttribute('data-theme', 'light');
  var sunEl   = document.getElementById('icon-sun');
  var moonEl  = document.getElementById('icon-moon');
  var lblEl   = document.getElementById('theme-label');
  if (sunEl)  sunEl.style.display  = 'none';
  if (moonEl) moonEl.style.display = 'block';
  if (lblEl)  lblEl.textContent    = 'Modo oscuro';
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

function fmtDateISO(v) {
  var raw = (v || '').toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;                         // ya YYYY-MM-DD
  var m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0'); // DD/MM/YYYY
  return raw.slice(0, 10);                                                  // fallback
}

function normalize(r) {
  function s(v) { return (v || '').toString().trim(); }
  return {
    fecha:    fmtDateISO(r.fecha),
    fn:       fmtDateISO(r.fn),  // fecha notificacion JIRA
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
  const mesRe = /^\d{4}-\d{2}$/;
  const ms = [...new Set(recs.map(r => (r.fecha||'').substring(0, 7)).filter(m => mesRe.test(m)))].sort().reverse();
  return ms;
}

function buildMonthSelects() {
  const ms  = getMonths(RECORDS);
  const msSS = getMonths(RECORDS_SS);
  const msKR = getMonths(RECORDS_KR);
  const msI  = getMonths(RECORDS_MCI_ING.map(r => ({ fecha: r.fecha || '' })));

  fillSelect('ss-mes', msSS.length ? msSS : ms);
  fillSelect('kr-mes', msKR.length ? msKR : ms);
  // MCI month select is self-populated in renderMCI()
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
          backgroundColor: function(ctx){
            var bg = ctx.dataset.backgroundColor;
            return Array.isArray(bg) ? bg[ctx.dataIndex] : (bg || '#3b82f6');
          },
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

  var recs = RECORDS.filter(function(r){ return r.fn === fecha; });
  badge.textContent = fecha.slice(8) + '/' + fecha.slice(5,7) + '/' + fecha.slice(0,4);
  total.textContent = recs.length.toLocaleString('es-CO');

  // Agrupar por Estado Caso (detalle)
  var por_com = {};
  recs.forEach(function(r){ var k = r.detalle || r.com || 'Sin estado'; por_com[k] = (por_com[k]||0)+1; });
  var top = topN(por_com, 8);

  var colores = ['var(--blue)','var(--green)','var(--amber)','var(--red)','var(--purple)','var(--blue)','var(--green)','var(--amber)'];

  rows.innerHTML = top.map(function(t, i){
    var pct = recs.length ? (t[1]/recs.length*100).toFixed(0) : 0;
    return '<div style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:32px;font-size:13px;line-height:1.4">' +
        '<span style="color:var(--text-secondary);word-break:break-word;flex:1">' + t[0] + '</span>' +
        '<strong style="color:var(--text-primary);font-size:15px;flex-shrink:0;min-width:32px;text-align:right">' + t[1] + '</strong>' +
      '</div>' +
      '<div style="height:7px;background:var(--bg-base);border-radius:4px">' +
        '<div style="height:100%;width:' + pct + '%;background:' + colores[i%colores.length] + ';border-radius:4px;transition:width .4s ease"></div>' +
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

  // Chart: por día — línea
  const byDay = countByDay(recs);
  const days  = Object.keys(byDay).sort();
  if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
  makeChart('chartSSDia', {
    type: 'line',
    plugins: window.ChartDataLabels ? [window.ChartDataLabels] : [],
    data: {
      labels: days.map(function(d){ return d.substring(8); }),
      datasets: [{
        label: 'Sin Stock',
        data: days.map(function(d){ return byDay[d]; }),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.07)',
        fill: true, tension: 0.35,
        pointBackgroundColor: '#ef4444', pointRadius: 4, pointHoverRadius: 7,
      }]
    },
    options: (function(){
      var d = getChartDefaults();
      return {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: window.ChartDataLabels ? {
            align: 'top', anchor: 'end',
            color: '#ffffff', backgroundColor: '#ef4444',
            borderRadius: 4, padding: { top:2, bottom:2, left:5, right:5 },
            font: { size: 10, weight: '700' },
            formatter: function(v){ return v > 0 ? v : ''; },
            display: function(ctx){ return ctx.dataset.data[ctx.dataIndex] > 0; }
          } : false,
        },
        scales: {
          x: { ticks: { color: d.text, font: { size: 9 }, maxTicksLimit: 31 }, grid: { color: d.grid } },
          y: { ticks: { color: d.text }, grid: { color: d.grid }, beginAtZero: true },
        }
      };
    })()
  });

  // Chart: por marca (un color por marca)
  const topMarca = topN(countBy(recs, 'marca'), 10);
  makeChart('chartSSMarca', horizontalBarConfig(
    topMarca.map(function(t){return t[0];}),
    topMarca.map(function(t){return t[1];}),
    topMarca.map(function(_,i){return COLORS[i % COLORS.length];}),
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
/* ── MCI helpers ── */
var chartMCI = null;

function toggleMciDrop() {
  var btn  = document.getElementById('mciMesBtn');
  var drop = document.getElementById('mciMesDrop');
  if (!btn || !drop) return;
  var open = drop.classList.toggle('open');
  btn.classList.toggle('open', open);
  if (open) {
    document.addEventListener('click', function closeDrop(e) {
      var wrap = document.getElementById('mciMesWrap');
      if (wrap && !wrap.contains(e.target)) {
        drop.classList.remove('open');
        btn.classList.remove('open');
        document.removeEventListener('click', closeDrop);
      }
    });
  }
}

function selectMciMes(ym) {
  var sel   = document.getElementById('mciMes');
  var drop  = document.getElementById('mciMesDrop');
  var btn   = document.getElementById('mciMesBtn');
  var label = document.getElementById('mciMesLabel');
  if (sel) sel.value = ym;
  if (drop) {
    drop.querySelectorAll('.mci-mes-item').forEach(function(it) {
      it.classList.toggle('active', it.dataset.ym === ym);
    });
    drop.classList.remove('open');
  }
  if (btn)  btn.classList.remove('open');
  if (label) {
    var MESES_ESP = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var p = ym.split('-');
    label.textContent = MESES_ESP[+p[1]] + ' ' + p[0];
  }
  renderMCI();
}

function saveIXCPrevTotal(input) {
  var sel = document.getElementById('mciMes');
  if (!sel || !sel.value) return;
  var ymCur = sel.value, p = ymCur.split('-'), yr = +p[0], mo = +p[1];
  var ymP = mo === 1 ? (yr-1) + '-12' : yr + '-' + (mo-1 < 10 ? '0' : '') + (mo-1);
  var key = 'ixc_total_' + ymP;
  var val = input.value !== '' ? parseInt(input.value, 10) : '';
  if (val !== '') localStorage.setItem(key, val);
  else localStorage.removeItem(key);
  renderMCI();
}

function saveIXC(input) {
  var iso  = input.dataset.iso;
  var key  = input.dataset.key;
  var val  = input.value !== '' ? parseInt(input.value, 10) : '';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
  if (val !== '') saved[iso] = val; else delete saved[iso];
  localStorage.setItem(key, JSON.stringify(saved));
  var total = Object.values(saved).reduce(function(s, v) { return s + (+v || 0); }, 0);
  var t = document.getElementById('ixc-row-total');
  if (t) t.textContent = total || '—';
}

function renderMCI() {
  var sel = document.getElementById('mciMes');
  if (!sel) return;
  var MESES_ESP = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Populate month selector once
  if (!sel.dataset.loaded) {
    var todosLosMeses = [];
    RECORDS.filter(function(r) { return r.fn && /^\d{4}-\d{2}-\d{2}$/.test(r.fn); })
           .forEach(function(r) {
             var ym0 = r.fn.slice(0, 7);
             if (todosLosMeses.indexOf(ym0) < 0) todosLosMeses.push(ym0);
           });
    todosLosMeses.sort();
    var meses = todosLosMeses.slice().reverse();
    sel.innerHTML = meses.map(function(m) {
      var p = m.split('-');
      return '<option value="' + m + '">' + MESES_ESP[+p[1]] + ' ' + p[0] + '</option>';
    }).join('');
    // Default: current month or most recent
    var _hoyYM = (new Date()).getFullYear() + '-' + String((new Date()).getMonth() + 1).padStart(2, '0');
    sel.value = (meses.indexOf(_hoyYM) !== -1 ? _hoyYM : meses[0]) || '';
    sel.dataset.loaded = '1';

    // Populate custom dropdown
    var drop  = document.getElementById('mciMesDrop');
    var label = document.getElementById('mciMesLabel');
    if (drop) {
      drop.innerHTML = meses.map(function(m) {
        var p = m.split('-');
        var nombre = MESES_ESP[+p[1]] + ' ' + p[0];
        return '<div class="mci-mes-item active" data-ym="' + m + '" onclick="selectMciMes(this.dataset.ym)">'
             + '<span style="font-size:11px;color:#94A3B8;margin-right:6px">🗓️</span>' + nombre + '</div>';
      }).join('');
    }
    if (label) {
      var p0 = sel.value.split('-');
      label.textContent = MESES_ESP[+p0[1]] + ' ' + p0[0];
    }
  }

  var ym = sel.value; if (!ym) return;
  var p0 = ym.split('-'), yr = +p0[0], mo = +p0[1];
  var nDias = new Date(yr, mo, 0).getDate();
  var dias = [];
  for (var d = 1; d <= nDias; d++) dias.push(ym + '-' + (d < 10 ? '0' : '') + d);

  var hoy    = new Date();
  var hoyISO = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') + '-' + String(hoy.getDate()).padStart(2,'0');

  // Previous month
  var ymPrev = mo === 1 ? (yr-1) + '-12' : yr + '-' + (mo-1 < 10 ? '0' : '') + (mo-1);
  var nDiasPrev = new Date(+ymPrev.split('-')[0], +ymPrev.split('-')[1], 0).getDate();
  var diasPrev = [];
  for (var d2 = 1; d2 <= nDiasPrev; d2++) diasPrev.push(ymPrev + '-' + (d2 < 10 ? '0' : '') + d2);

  var cntFnPrev = {};
  RECORDS.filter(function(r) { return r.fn && r.fn.slice(0,7) === ymPrev; })
         .forEach(function(r) { cntFnPrev[r.fn] = (cntFnPrev[r.fn]||0) + 1; });
  var ingPrev = diasPrev.reduce(function(s, d) { return s + (cntFnPrev[d]||0); }, 0);

  var keyPrev    = 'ixc_' + ymPrev;
  var savedPrev  = {};
  try { savedPrev = JSON.parse(localStorage.getItem(keyPrev) || '{}'); } catch(e) {}
  var ixcPrevDiario = diasPrev.reduce(function(s, d) { return s + (+savedPrev[d] || 0); }, 0);
  var ixcPrevTotalKey = 'ixc_total_' + ymPrev;
  var ixcPrevTotalSaved = localStorage.getItem(ixcPrevTotalKey);
  var ixcPrev = ixcPrevTotalSaved !== null ? parseInt(ixcPrevTotalSaved, 10) : ixcPrevDiario;
  var mciPrev = ixcPrev > 0 ? (ingPrev / ixcPrev * 100).toFixed(2) + '%' : '—';

  var DOW = ['D','L','M','M','J','V','S'];
  function dow(iso) { var p = iso.split('-'); return DOW[new Date(+p[0], +p[1]-1, +p[2]).getDay()]; }
  function isWE(iso) { var p = iso.split('-'); var w = new Date(+p[0], +p[1]-1, +p[2]).getDay(); return w===0||w===6; }
  function isFut(iso) { return iso > hoyISO; }

  // Current month ORs by r.fn
  var cntFn = {};
  RECORDS.filter(function(r) { return r.fn && r.fn.slice(0,7) === ym; })
         .forEach(function(r) { cntFn[r.fn] = (cntFn[r.fn]||0) + 1; });
  var totalIng = dias.reduce(function(s, d) { return s + (cntFn[d]||0); }, 0);

  var SH = 'padding:7px 8px;text-align:center;font-weight:700;border:1px solid #E2E8F0;white-space:nowrap;font-size:10.5px;';
  var SL = 'padding:8px 12px;text-align:left;border:1px solid #E2E8F0;font-weight:600;min-width:200px;font-size:11px;';
  var SV = 'padding:7px 8px;text-align:center;border:1px solid #E2E8F0;white-space:nowrap;font-size:11px;';
  var CH = 'background:#EFF6FF;color:#1E40AF;';
  var CW = 'background:#F8FAFC;color:#CBD5E1;';
  var CF = 'background:#FAFAFA;color:#E2E8F0;';

  function cs(iso, bg) {
    if (iso === hoyISO) return SV + 'background:#FEF9C3;';
    if (isFut(iso))     return SV + CF;
    if (isWE(iso))      return SV + CW;
    return SV + 'background:' + bg + ';';
  }

  function buildHeader(d1, d2) {
    var de = document.getElementById(d1), dy = document.getElementById(d2);
    if (!de || !dy) return;
    var hd = '<th style="' + SH + 'background:#DBEAFE;color:#1E3A8A;min-width:200px;font-weight:800">Métrica</th>'
           + '<th style="' + SH + 'background:#DBEAFE;color:#1E3A8A;border-right:2px solid #93C5FD">Total Mes<br>Anterior</th>';
    var hn = '<th style="' + SH + 'background:#EFF6FF;color:#1E40AF"></th>'
           + '<th style="' + SH + 'background:#EFF6FF;color:#1E40AF;border-right:2px solid #93C5FD"></th>';
    dias.forEach(function(iso) {
      var we = isWE(iso), fut = isFut(iso), esHoy = iso === hoyISO;
      var bg  = esHoy ? '#FEF9C3' : (fut ? '#F8FAFC' : (we ? '#F1F5F9' : '#1E3A8A'));
      var col = esHoy ? '#92400E' : (fut || we ? '#94A3B8' : '#fff');
      hd += '<th style="' + SH + 'background:' + bg + ';color:' + col + '">' + dow(iso) + '</th>';
      hn += '<th style="' + SH + 'background:' + bg + ';color:' + col + '">' + parseInt(iso.slice(8), 10) + '</th>';
    });
    hd += '<th style="' + SH + CH + '">Total Mes</th>';
    hn += '<th style="' + SH + CH + '"></th>';
    de.innerHTML = hd; dy.innerHTML = hn;
  }

  function buildRow(label, prevVal, totalVal, vals, bg) {
    var tr = '<tr>';
    tr += '<td style="' + SL + 'background:' + bg + '">' + label + '</td>';
    tr += '<td style="' + SV + 'background:#EFF6FF;font-weight:700;border-right:2px solid #93C5FD">' + prevVal + '</td>';
    dias.forEach(function(iso, i) {
      var v = vals ? vals[i] : null;
      var disp = (v === null || v === undefined) ? '' : (isFut(iso) ? '' : (isWE(iso) && !v ? '' : v));
      tr += '<td style="' + cs(iso, bg) + '">' + disp + '</td>';
    });
    var s = vals ? vals.reduce(function(a, b) { return a + (typeof b === 'number' ? b : 0); }, 0) : '—';
    tr += '<td style="' + SV + 'background:' + bg + ';font-weight:700">' + (typeof s === 'number' ? s : '—') + '</td>';
    return tr + '</tr>';
  }

  function buildIXCRow() {
    var BG  = '#F0FDF4';
    var SI  = 'width:52px;border:1px solid #CBD5E1;border-radius:4px;padding:2px 4px;font-size:11px;text-align:center;background:transparent;outline:none;font-family:inherit;';
    var SI2 = 'width:70px;border:1px solid #93C5FD;border-radius:4px;padding:3px 5px;font-size:11px;font-weight:700;text-align:center;background:#EFF6FF;outline:none;font-family:inherit;';
    var key  = 'ixc_' + ym;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
    var mesTotal = dias.reduce(function(s, iso) { return s + (+saved[iso] || 0); }, 0);

    var keyPrevTotal  = 'ixc_total_' + ymPrev;
    var prevTotalSaved = localStorage.getItem(keyPrevTotal);
    var prevTotalVal   = prevTotalSaved !== null ? prevTotalSaved : '';

    var tr = '<tr>';
    tr += '<td style="' + SL + 'background:' + BG + '">Total ORs generadas en IX</td>';
    tr += '<td style="' + SV + 'background:#EFF6FF;border-right:2px solid #93C5FD">'
        + '<input type="number" min="0" style="' + SI2 + '" value="' + prevTotalVal + '" placeholder="—"'
        + ' id="ixc-prev-total-input" onchange="saveIXCPrevTotal(this)" oninput="saveIXCPrevTotal(this)"></td>';
    dias.forEach(function(iso) {
      var tdS = cs(iso, BG);
      if (isFut(iso) || isWE(iso)) {
        tr += '<td style="' + tdS + '"></td>';
      } else {
        var v = saved[iso] !== undefined ? saved[iso] : '';
        tr += '<td style="' + tdS + '"><input type="number" min="0" style="' + SI + '" value="' + v + '" placeholder="—"'
           + ' data-iso="' + iso + '" data-key="' + key + '" onchange="saveIXC(this)" oninput="saveIXC(this)"></td>';
      }
    });
    tr += '<td id="ixc-row-total" style="' + SV + 'background:' + BG + ';font-weight:700">' + (mesTotal || '—') + '</td>';
    return tr + '</tr>';
  }

  function buildMCIRow() {
    var BG  = '#ECFEFF';
    var key = 'ixc_' + ym;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}
    var ixcTotal = dias.reduce(function(s, iso) { return s + (+saved[iso] || 0); }, 0);
    var ingTotal = dias.reduce(function(s, iso) { return s + (cntFn[iso] || 0); }, 0);
    var pctTotal = ixcTotal > 0 ? (ingTotal / ixcTotal * 100).toFixed(2) + '%' : '—';
    var tr = '<tr>';
    tr += '<td style="' + SL + 'background:' + BG + '">MCI: % ORs Incidentadas en el día</td>';
    tr += '<td style="' + SV + 'background:#EFF6FF;font-weight:700;border-right:2px solid #93C5FD">' + mciPrev + '</td>';
    dias.forEach(function(iso) {
      var ixc = +saved[iso] || 0;
      var inc = cntFn[iso] || 0;
      var pct = (!isWE(iso) && !isFut(iso) && ixc > 0) ? (inc / ixc * 100).toFixed(2) + '%' : '';
      var bg  = iso === hoyISO ? '#FEF9C3' : (isFut(iso) ? '#F8FAFC' : (isWE(iso) ? '#F1F5F9' : BG));
      tr += '<td style="' + SV + 'background:' + bg + ';font-weight:700">' + pct + '</td>';
    });
    tr += '<td style="' + SV + 'background:' + BG + ';font-weight:700">' + pctTotal + '</td>';
    return tr + '</tr>';
  }

  function topTip(records, max) {
    var cnt = {};
    records.forEach(function(r) { if (r.detalle) { cnt[r.detalle] = (cnt[r.detalle]||0) + 1; } });
    var sorted = Object.keys(cnt).sort(function(a,b) { return cnt[b] - cnt[a]; });
    var n = sorted.length >= 5 ? max : Math.min(3, sorted.length);
    if (n === 0) return '';
    return sorted.slice(0, n).map(function(e, i) { return (i+1) + '. ' + e + ' (' + cnt[e] + ')'; }).join('\n');
  }

  function buildIngRow() {
    var BG = '#EFF6FF';
    var recsMes  = RECORDS.filter(function(r) { return r.fn && r.fn.slice(0,7) === ym; });
    var recsPrev = RECORDS.filter(function(r) { return r.fn && r.fn.slice(0,7) === ymPrev; });
    var tipPrev  = topTip(recsPrev, 5);
    var tipTotal = topTip(recsMes, 5);
    var tr = '<tr>';
    tr += '<td style="' + SL + 'background:' + BG + '">ORs Ingresadas en el día actual</td>';
    var prevCell = ingPrev ? String(ingPrev) : '—';
    tr += '<td style="' + SV + 'background:#EFF6FF;font-weight:700;border-right:2px solid #93C5FD'
        + (tipPrev ? '" class="mci-tip" data-tip="' + tipPrev.replace(/"/g, '&quot;') : '')
        + '">' + prevCell + '</td>';
    dias.forEach(function(iso) {
      var v = cntFn[iso] || 0;
      var disp = isFut(iso) ? '' : (isWE(iso) && !v ? '' : v);
      var style = cs(iso, BG);
      if (!isFut(iso) && !isWE(iso) && v > 0) {
        var recsDay = RECORDS.filter(function(r) { return r.fn === iso; });
        var tip = topTip(recsDay, 5);
        tr += '<td style="' + style + '" class="mci-tip" data-tip="' + tip.replace(/"/g, '&quot;') + '">' + disp + '</td>';
      } else {
        tr += '<td style="' + style + '">' + disp + '</td>';
      }
    });
    tr += '<td style="' + SV + 'background:' + BG + ';font-weight:700'
        + (tipTotal ? '" class="mci-tip" data-tip="' + tipTotal.replace(/"/g, '&quot;') : '')
        + '">' + (totalIng || '—') + '</td>';
    return tr + '</tr>';
  }

  // Build table
  buildHeader('mci-dow1', 'mci-day1');
  var ingVals = dias.map(function(iso) { return cntFn[iso] || 0; });
  var b1 = document.getElementById('mci-body1');
  if (b1) b1.innerHTML = [
    buildIngRow(),
    buildRow('OR Realmente Incidentadas', ingPrev, totalIng, ingVals, '#F0FDF4'),
    buildIXCRow(),
    buildMCIRow(),
  ].join('');

  // Line chart MCI%
  var key2   = 'ixc_' + ym;
  var saved2 = {};
  try { saved2 = JSON.parse(localStorage.getItem(key2) || '{}'); } catch(e) {}
  var chartLabels = [], chartVals = [], chartColors = [];
  dias.forEach(function(iso) {
    if (isWE(iso) || isFut(iso)) return;
    var ixc = +saved2[iso] || 0;
    var inc = cntFn[iso] || 0;
    if (ixc === 0) return;
    var pct = parseFloat((inc / ixc * 100).toFixed(2));
    chartLabels.push(parseInt(iso.slice(8), 10));
    chartVals.push(pct);
    chartColors.push(iso === hoyISO ? '#F59E0B' : (pct >= 80 ? '#22C55E' : (pct >= 50 ? '#3B82F6' : '#EF4444')));
  });

  var cvs = document.getElementById('chartMCI');
  if (cvs && typeof Chart !== 'undefined') {
    if (chartMCI) { chartMCI.destroy(); chartMCI = null; }
    chartMCI = new Chart(cvs, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'MCI %',
          data: chartVals,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59,130,246,0.06)',
          pointBackgroundColor: chartColors,
          pointBorderColor: chartColors,
          pointRadius: 6,
          pointHoverRadius: 8,
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          datalabels: { display: false }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 36 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return 'MCI: ' + ctx.parsed.y + '%'; }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Día del mes', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { min: 0, title: { display: true, text: '% MCI', font: { size: 10 } }, suggestedMax: 20,
               ticks: { callback: function(v) { return v + '%'; }, stepSize: 10 },
               grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      },
      plugins: [ChartDataLabels, {
        id: 'mciPointLabels',
        afterDatasetsDraw: function(chart) {
          var ds   = chart.data.datasets[0];
          if (!ds) return;
          var meta = chart.getDatasetMeta(0);
          var ctx2 = chart.ctx;
          meta.data.forEach(function(point, i) {
            var val = ds.data[i];
            if (val === null || val === undefined) return;
            var color  = chartColors[i] || '#3B82F6';
            var x = point.x, y = point.y;
            var offsetY = (y - 18) < chart.chartArea.top ? 18 : -10;
            ctx2.save();
            ctx2.font = 'bold 10px "Segoe UI",sans-serif';
            ctx2.fillStyle = color;
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'middle';
            ctx2.fillText(val + '%', x, y + offsetY);
            ctx2.restore();
          });
        }
      }]
    });
  }
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
