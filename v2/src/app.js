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
  const loadEl  = document.getElementById('loadingScreen');
  const errEl   = document.getElementById('errorScreen');
  loadEl.style.display = 'flex';
  errEl.style.display  = 'none';

  try {
    const resp = await fetch('../data/data.json?_=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    DATA = await resp.json();
    processData();
    loadEl.style.display = 'none';
    renderAll();
    updateLastUpdate();
  } catch (e) {
    console.error('[loadData]', e);
    loadEl.style.display = 'none';
    errEl.style.display  = 'flex';
    document.getElementById('errorMsg').textContent = e.message;
    // For local dev: generate demo data
    DATA = buildDemoData();
    processData();
    renderAll();
    updateLastUpdate();
    errEl.style.display = 'none';
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
  return {
    fecha:    (r.fecha || r.Fecha || '').toString().trim(),
    marca:    (r.marca || r.Marca || '').toString().trim(),
    pais:     (r.pais  || r.País  || r.Pais || '').toString().trim(),
    estado:   (r.estado || r.Estado || '').toString().trim(),
    ops:      (r.ops   || r.Ops   || r.operador || '').toString().trim(),
    com:      (r.com   || r.Com   || r.comentario || '').toString().trim(),
    ov:       (r.ov    || r.OV    || '').toString().trim(),
  };
}

function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function isSinStock(r) {
  return norm(r.com).includes('sin stock') || norm(r.ops).includes('sin stock');
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

  fillSelect('sel-mes-overview', ms);
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
  return {
    type: 'bar',
    data: { labels, datasets },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: datasets.length > 1, labels: { color: d.text, font: { size: 11 }, boxWidth: 12, padding: 12 } } },
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
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: color || '#3b82f6', borderRadius: 4, barThickness: 14 }]
    },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
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
   OVERVIEW TAB
══════════════════════════════════ */
function renderOverview() {
  const total   = RECORDS.length;
  const ss      = RECORDS_SS.length;
  const kr      = RECORDS_KR.length;
  const lib     = RECORDS.filter(function (r) { return norm(r.estado).includes('liberada') || norm(r.estado).includes('cerrada'); }).length;

  setKPI('kpi-total-orders', total);
  setKPI('kpi-sinstock', ss);
  setKPI('kpi-kronotime', kr);
  setKPI('kpi-liberadas', lib);
  renderOverviewChart();
  renderIssuesChart();
  renderPaisChart();
  renderProvChart();
  renderEstadoChart();
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof val === 'number' ? val.toLocaleString('es-CO') : val;
}

function renderOverviewChart() {
  const mes = document.getElementById('sel-mes-overview')?.value;
  const sub = document.getElementById('chart-sub-month');
  if (sub && mes) sub.textContent = fmtMonth(mes);

  const recs = filterByMonth(RECORDS, mes);
  const byDay = countByDay(recs);
  const labels = Object.keys(byDay).sort();
  const values = labels.map(function (l) { return byDay[l]; });

  makeChart('chartOverviewDia', barConfig(
    labels.map(function (l) { return l.substring(8); }),
    [{ label: 'Órdenes', data: values, backgroundColor: '#3b82f6', borderRadius: 5, barThickness: 12 }]
  ));
}

function renderIssuesChart() {
  const cats = { 'Sin Stock': RECORDS_SS.length, 'Kronotime': RECORDS_KR.length };
  RECORDS.forEach(function (r) {
    const c = norm(r.com);
    if (!isSinStock(r) && !isKrono(r)) {
      const k = r.com || 'Otro';
      cats[k] = (cats[k] || 0) + 1;
    }
  });
  const top = topN(cats, 8);
  makeChart('chartIssues', doughnutConfig(top.map(function (t) { return t[0]; }), top.map(function (t) { return t[1]; })));
}

function renderPaisChart() {
  const m = countBy(RECORDS, 'pais');
  const top = topN(m, 8);
  makeChart('chartPais', doughnutConfig(top.map(function (t) { return t[0]; }), top.map(function (t) { return t[1]; })));
}

function renderProvChart() {
  const m = countBy(RECORDS, 'marca');
  const top = topN(m, 8);
  makeChart('chartProv', doughnutConfig(
    top.map(function (t) { return t[0]; }),
    top.map(function (t) { return t[1]; }),
    COLORS.slice(3)
  ));
}

function renderEstadoChart() {
  const m = countBy(RECORDS, 'estado');
  const top = topN(m, 8);
  const palette = top.map(function (_, i) { return COLORS[i % COLORS.length]; });
  makeChart('chartEstado', doughnutConfig(top.map(function (t) { return t[0]; }), top.map(function (t) { return t[1]; }), palette));
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

  // Chart: por día
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
  if (tab === 'overview')   { renderOverviewChart(); renderIssuesChart(); }
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
  const meses = ['2026-06','2026-07','2026-08','2026-09'];
  const marcas = ['JBL','Harman','Samsung','AKG','Infinity'];
  const paises = ['Colombia','Chile','México','Perú'];
  const estados = ['En revisión','Pendiente proveedor','Liberada','Cancelada'];
  const coms_ss = ['Sin stock en bodega', 'SIN STOCK', 'Sin Stock - proveedor'];
  const coms_kr = ['Escalado con Kronotime'];
  const coms_other = ['Dirección incorrecta','Pago rechazado','Peso excedido'];

  function rnd(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function rndDate(m) {
    const d = new Date(m+'-01');
    d.setDate(Math.floor(Math.random()*28)+1);
    return d.toISOString().substring(0,10);
  }

  const inc = [];
  // 999 sin stock
  for (let i=0;i<999;i++) inc.push({ fecha: rndDate(rnd(meses)), marca: rnd(marcas), pais: rnd(paises), estado: rnd(estados), com: rnd(coms_ss), ops: '', ov: 'OV'+Math.floor(Math.random()*99999) });
  // 98 kronotime
  for (let i=0;i<98;i++) inc.push({ fecha: rndDate(rnd(meses)), marca: rnd(marcas), pais: rnd(paises), estado: rnd(estados), com: 'Escalado con Kronotime', ops: '', ov: 'OV'+Math.floor(Math.random()*99999) });
  // 500 other
  for (let i=0;i<500;i++) inc.push({ fecha: rndDate(rnd(meses)), marca: rnd(marcas), pais: rnd(paises), estado: rnd(estados), com: rnd(coms_other), ops: '', ov: 'OV'+Math.floor(Math.random()*99999) });

  const ing = [];
  for (let i=0;i<5000;i++) ing.push({ fecha: rndDate(rnd(meses)) });

  const jiras = [];
  for (let i=0;i<50;i++) {
    const m = rnd(meses);
    jiras.push({ ticket:'GDI-'+String(1000+i), marca: rnd(marcas), pais: rnd(paises), fecha: rndDate(m), estado: rnd(['Abierto','En progreso','Esperando respuesta','Resuelto']), pendiente: rnd(['IT','Proveedor','Cliente','—']) });
  }

  return { generatedAt: new Date().toISOString(), incidencias: inc, ingresadas: ing, jiras: jiras };
}
