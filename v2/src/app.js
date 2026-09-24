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

function extractBrand(marca) {
  if (!marca) return '';
  var s = marca.trim();
  var paises = ['Colombia','Chile','Mexico','México','Peru','Perú','Guatemala',
                'Panama','Panamá','Uruguay','Salvador','El Salvador','Costa Rica',
                'Argentina','Brasil','Brazil','Ecuador','Venezuela','Honduras','Nicaragua'];
  for (var pi = 0; pi < paises.length; pi++) {
    var p = paises[pi];
    if (s.toLowerCase().endsWith(' ' + p.toLowerCase())) {
      return s.slice(0, s.length - p.length - 1).trim();
    }
  }
  return s;
}

/* Mapa de alias → nombre canónico de marca */
var BRAND_CANON = {
  // Kenneth Cole
  'kc': 'Kenneth Cole', 'kenneth cole': 'Kenneth Cole',
  // New Balance
  'nb': 'New Balance', 'new balace': 'New Balance', 'new balance': 'New Balance',
  // Running Balboa
  'rb': 'Running Balboa', 'running': 'Running Balboa', 'running balboa': 'Running Balboa',
  // JBL
  'jb': 'JBL', 'jbl': 'JBL',
  // Marketplace
  'mkp': 'Marketplace', 'marketplace': 'Marketplace', 'mexico': 'Marketplace',
  // Cubitt
  'cu': 'Cubitt', 'cub': 'Cubitt', 'cubitt': 'Cubitt',
  // Epson
  'epson': 'Epson',
  // Motorola
  'motorola': 'Motorola',
  // Dockers (incluye abreviaturas y países mal parseados solos)
  'dk': 'Dockers', 'do': 'Dockers', 'dockers': 'Dockers',
  'chile': 'Dockers', 'peru': 'Dockers', 'perú': 'Dockers',
  // Lacoste
  'lc': 'Lacoste',
  // Crocs
  'crocs': 'Crocs',
  // Harman Audio
  'har': 'Harman Audio', 'harman': 'Harman Audio', 'harman audio': 'Harman Audio',
  // ON Running
  'on': 'ON Running',
};

function canonBrand(marca) {
  if (!marca) return '';
  var s = extractBrand(marca.trim());  // quitar país del final
  var key = s.toLowerCase();
  return BRAND_CANON[key] || s;
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

  // KPI cards dinámicas
  _renderOvKpis(total, sol, cont, rev);

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

function _renderOvKpis(total, sol, cont, rev) {
  var el = document.getElementById('kpi-overview');
  if (!el) return;

  var _ovCfg = [
    { id:'ov-kpi-total', val:total, label:'En Revisión CO-IT', sub:'Total activos',          accent:'#2563EB', light:'#EFF6FF', ring:'#BFDBFE', base: total },
    { id:'ov-kpi-sol',   val:sol,   label:'Solucionado',        sub:'Ops. Solucionado',       accent:'#16A34A', light:'#F0FDF4', ring:'#BBF7D0', base: total },
    { id:'ov-kpi-cont',  val:cont,  label:'Continuidad',        sub:'Pendiente continuidad',  accent:'#D97706', light:'#FFFBEB', ring:'#FDE68A', base: total },
    { id:'ov-kpi-rev',   val:rev,   label:'Rev./Config.',       sub:'Ops. Rev./Configuración',accent:'#7C3AED', light:'#F5F3FF', ring:'#DDD6FE', base: total },
  ];

  var _uid = 'ovkpi' + Date.now();

  function _ovCard(cfg, idx) {
    var pct  = cfg.base > 0 ? Math.round(cfg.val / cfg.base * 100) : 0;
    var barW = cfg.base > 0 ? Math.round(cfg.val / Math.max(total,1) * 100) : 0;
    var r = 28, circ = 2 * Math.PI * r;
    var uid = _uid + idx;
    var noData = cfg.val === 0;
    return '<div style="background:'+ cfg.light +';border-radius:16px;padding:20px 18px 16px;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.07);position:relative;overflow:hidden">'
      // fondo decorativo
      + '<div style="position:absolute;top:-16px;right:-16px;width:88px;height:88px;border-radius:50%;background:'+ cfg.ring +';opacity:.5;pointer-events:none"></div>'
      // top row
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
      +   '<div>'
      +     '<div style="font-size:10px;font-weight:800;color:'+ cfg.accent +';text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">'+ cfg.label +'</div>'
      +     '<div id="'+ uid +'-num" style="font-size:36px;font-weight:900;color:'+ (noData?'#CBD5E1':cfg.accent) +';line-height:1;font-variant-numeric:tabular-nums">0</div>'
      +     '<div style="font-size:11px;color:#64748B;margin-top:4px;font-weight:600">'+ cfg.sub +'</div>'
      +   '</div>'
      // donut
      +   '<svg width="68" height="68" viewBox="0 0 68 68" style="flex-shrink:0">'
      +     '<circle cx="34" cy="34" r="'+ r +'" fill="none" stroke="#E2E8F0" stroke-width="8"/>'
      +     '<circle id="'+ uid +'-arc" cx="34" cy="34" r="'+ r +'" fill="none" stroke="'+ cfg.accent +'" stroke-width="8"'
      +       ' stroke-linecap="round" stroke-dasharray="0 '+ circ.toFixed(1) +'"'
      +       ' transform="rotate(-90 34 34)" style="transition:stroke-dasharray .8s cubic-bezier(.4,0,.2,1)"/>'
      +     '<text x="34" y="38" text-anchor="middle" font-size="14" font-weight="800" fill="'+ (noData?'#CBD5E1':cfg.accent) +'">'+ pct +'%</text>'
      +   '</svg>'
      + '</div>'
      // barra
      + '<div style="margin-top:14px">'
      +   '<div style="height:5px;background:#E2E8F0;border-radius:10px;overflow:hidden">'
      +     '<div id="'+ uid +'-bar" style="height:100%;width:0%;background:linear-gradient(90deg,'+ cfg.accent +'88,'+ cfg.accent +');border-radius:10px;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>'
      +   '</div>'
      +   '<div style="margin-top:5px;font-size:10px;color:#94A3B8">'+ pct +'% del total</div>'
      + '</div>'
      + '</div>';
  }

  el.innerHTML = _ovCfg.map(_ovCard).join('');

  // Animar tras render
  setTimeout(function() {
    _ovCfg.forEach(function(cfg, idx) {
      var uid  = _uid + idx;
      var pct  = cfg.base > 0 ? Math.round(cfg.val / cfg.base * 100) : 0;
      var barW = cfg.base > 0 ? Math.round(cfg.val / Math.max(total,1) * 100) : 0;
      var r = 28, circ = 2 * Math.PI * r;
      var dash = (pct / 100 * circ).toFixed(1);
      var barEl = document.getElementById(uid + '-bar');
      if (barEl) barEl.style.width = barW + '%';
      var arcEl = document.getElementById(uid + '-arc');
      if (arcEl) arcEl.setAttribute('stroke-dasharray', dash + ' ' + circ.toFixed(1));
      var numEl = document.getElementById(uid + '-num');
      if (numEl && cfg.val > 0) {
        var t = 0, dur = 750, step = 20;
        var iv = setInterval(function() {
          t += step;
          numEl.textContent = Math.min(cfg.val, Math.round(cfg.val * (1 - Math.pow(1 - t/dur, 3))));
          if (t >= dur) { numEl.textContent = cfg.val; clearInterval(iv); }
        }, step);
      }
    });
  }, 60);
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

/* ── Tabla Dependencias — Últimos 15 días (lógica V1) ── */
function renderDependenciasTable(enRevRecs) {
  var dateRe  = /^\d{4}-\d{2}-\d{2}$/;

  // Filtro fijo igual a V1: isEnRevIT + Continuidad
  var recsNotif = RECORDS.filter(function(r){ return isEnRevIT(r) && r.pen === 'Continuidad'; });

  // Fechas de notificación de TODOS los registros (no solo Continuidad, como V1)
  var allNotifFechas = [];
  var _fnSeen = {};
  RECORDS.forEach(function(r){
    if(r.fn && dateRe.test(r.fn) && !_fnSeen[r.fn]){ _fnSeen[r.fn]=true; allNotifFechas.push(r.fn); }
  });
  allNotifFechas.sort();

  // Usar la fecha más reciente como cutoff (no hay selector en V2)
  var cutoff = allNotifFechas[allNotifFechas.length - 1] || '';
  var ult15  = allNotifFechas.filter(function(f){ return f <= cutoff; }).slice(-15);

  // Semana actual: lunes–viernes de la semana en curso
  var _hoyD = new Date();
  var _dow  = _hoyD.getDay(); // 0=dom
  var _mondayOffset = _dow === 0 ? -6 : 1 - _dow;
  var _monday = new Date(_hoyD); _monday.setDate(_hoyD.getDate() + _mondayOffset);
  var _friday = new Date(_monday); _friday.setDate(_monday.getDate() + 4);
  function _toISO(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  var _mondayISO = _toISO(_monday);
  var _fridayISO = _toISO(_friday);
  var _semana    = ult15.filter(function(f){ return f >= _mondayISO && f <= _fridayISO; });

  // Mes actual: día 1 al hoy
  var _mesISO = _hoyD.getFullYear() + '-' + String(_hoyD.getMonth()+1).padStart(2,'0') + '-01';
  var _hoyISO = _toISO(_hoyD);

  // Agrupar por com → fn → count (para los 15 días)
  var tblData = {};
  recsNotif.forEach(function(r){
    if(!r.com || !r.fn) return;
    if(!tblData[r.com]) tblData[r.com] = {};
    tblData[r.com][r.fn] = (tblData[r.com][r.fn] || 0) + 1;
  });

  // Acumulado mes actual (igual que V1)
  var mesData = {};
  recsNotif.forEach(function(r){
    if(!r.com || !r.fn) return;
    if(r.fn >= _mesISO && r.fn <= _hoyISO) mesData[r.com] = (mesData[r.com]||0) + 1;
  });

  // Comentarios ordenados por acumulado del mes desc (igual que V1)
  var TOP_COM = [];
  var _comSeen = {};
  recsNotif.forEach(function(r){ if(r.com && !_comSeen[r.com]){ _comSeen[r.com]=true; TOP_COM.push(r.com); } });
  TOP_COM.sort(function(a,b){ return (mesData[b]||0)-(mesData[a]||0); });

  // Actualizar rango
  var rng = document.getElementById('ov-tabla-rango');
  if(rng && ult15.length > 0)
    rng.textContent = ' — ' + ult15[0].slice(5).replace('-','/') + ' al ' + ult15[ult15.length-1].slice(5).replace('-','/');

  // Thead
  var thead = document.getElementById('ov-tblHead');
  if (!thead) return;
  var thHtml = '<tr><th style="min-width:180px;text-align:left">Comentario continuidad</th>';
  ult15.forEach(function(f){
    var isSem = _semana.indexOf(f) !== -1;
    thHtml += '<th style="text-align:center' + (isSem ? ';background:#EFF6FF;color:#1E40AF' : '') + '">' + f.slice(5).replace('-','/') + '</th>';
  });
  thHtml += '<th class="dep-tot15" style="text-align:center;background:#EFF6FF;color:#1E40AF;white-space:nowrap">Sem. actual</th>'
          + '<th class="dep-toth"  style="text-align:center;background:#F0FDF4;color:#166534;white-space:nowrap">Mes actual</th></tr>';
  thead.innerHTML = thHtml;

  // Tbody — rojo en el máximo de cada fila (igual que V1)
  var tbody = document.getElementById('ov-tblBody');
  if (!tbody) return;
  var bodyHtml = '';
  TOP_COM.forEach(function(com) {
    var dias    = tblData[com] || {};
    var rowVals = ult15.map(function(f){ return dias[f] || 0; });
    var maxRow  = Math.max.apply(null, rowVals.concat([1]));
    var totSem  = _semana.reduce(function(a,f){ return a + (dias[f]||0); }, 0);
    var totMes  = mesData[com] || 0;

    bodyHtml += '<tr><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + com + '">' + com + '</td>';
    rowVals.forEach(function(v){
      var isSem = _semana.indexOf(ult15[rowVals.indexOf(v)]) !== -1;
      var bgSem = isSem ? 'background:#F8FBFF;' : '';
      if(v === 0)            bodyHtml += '<td class="dep-zero" style="text-align:center;' + bgSem + '">·</td>';
      else if(v === maxRow)  bodyHtml += '<td class="dep-max"  style="text-align:center;' + bgSem + '">' + v + '</td>';
      else                   bodyHtml += '<td class="dep-val"  style="text-align:center;' + bgSem + '">' + v + '</td>';
    });
    bodyHtml += '<td class="dep-tot15" style="text-align:center;background:#EFF6FF;font-weight:700;color:#1E40AF">' + totSem + '</td>';
    bodyHtml += '<td class="dep-toth"  style="text-align:center;background:#F0FDF4;font-weight:700;color:#166534">' + totMes + '</td>';
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml || '<tr><td colspan="20" style="text-align:center;color:var(--text-muted);padding:20px">Sin registros de Continuidad</td></tr>';

  // Tfoot — resaltar columna con mayor total (igual que V1)
  var tfoot = document.getElementById('ov-tblFoot');
  if (tfoot) {
    var colTots = ult15.map(function(f){
      return TOP_COM.reduce(function(s,com){ return s + ((tblData[com]||{})[f] || 0); }, 0);
    });
    var maxColTot = Math.max.apply(null, colTots.concat([1]));
    var grandSem  = _semana.reduce(function(a,f){
      var idx = ult15.indexOf(f); return idx >= 0 ? a + (colTots[idx]||0) : a;
    }, 0);
    var grandMes  = TOP_COM.reduce(function(s,c){ return s + (mesData[c]||0); }, 0);

    var tfHtml = '<tr style="font-weight:700;background:#F8FAFC;border-top:2px solid #E2E8F0">';
    tfHtml += '<td style="text-align:left;color:#1E293B">Total</td>';
    colTots.forEach(function(v, i){
      var isSem = _semana.indexOf(ult15[i]) !== -1;
      var isHot = v === maxColTot && v > 0;
      var bg    = isHot ? 'background:#FEF2F2;color:#DC2626;' : (isSem ? 'background:#F8FBFF;color:#1E40AF;' : '');
      tfHtml += '<td style="text-align:center;' + bg + '">' + (v || '·') + '</td>';
    });
    tfHtml += '<td class="dep-tot15" style="text-align:center;background:#EFF6FF;color:#1E40AF">' + grandSem + '</td>';
    tfHtml += '<td class="dep-toth"  style="text-align:center;background:#F0FDF4;color:#166534">' + grandMes  + '</td>';
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
  if (marca) recs = recs.filter(function(r){ return canonBrand(r.marca) === marca; });

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

  // Select marca — usar nombres canónicos agrupados
  var selMarca = document.getElementById('sel-marca-overview');
  if (selMarca) {
    var curMarca = selMarca.value;
    var canonSet = {};
    RECORDS.forEach(function(r){ var c = canonBrand(r.marca); if(c) canonSet[c] = true; });
    var canonMarcas = Object.keys(canonSet).sort();
    selMarca.innerHTML = '<option value="">Todas las marcas</option>';
    canonMarcas.forEach(function(m){ var o=document.createElement('option'); o.value=m; o.textContent=m; selMarca.appendChild(o); });
    if (curMarca && canonSet[curMarca]) selMarca.value = curMarca;
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

  // Contar por r.fn agrupando marcas canónicas
  var byDay = {};
  RECORDS.forEach(function(r){
    if (r.fn && /^\d{4}-\d{2}-\d{2}$/.test(r.fn) && r.fn.startsWith(mesFinal)) {
      if (!marca || canonBrand(r.marca) === marca) byDay[r.fn] = (byDay[r.fn]||0)+1;
    }
  });

  var vals   = dias.map(function(dia){ return byDay[dia] || 0; });
  var labels = dias.map(function(dia){ return dia.slice(8); }); // número de día

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
            borderRadius: 4, padding: { top:2, bottom:2, left:5, right:5 },
            font: function(ctx){
              var data = ctx.dataset.data;
              var max  = Math.max.apply(null, data);
              return { size: ctx.dataset.data[ctx.dataIndex] === max ? 11 : 10, weight: '700' };
            },
            color: function(ctx){
              var data = ctx.dataset.data;
              var max  = Math.max.apply(null, data);
              return ctx.dataset.data[ctx.dataIndex] === max ? '#ffffff' : '#1E293B';
            },
            backgroundColor: function(ctx){
              var data = ctx.dataset.data;
              var max  = Math.max.apply(null, data);
              return ctx.dataset.data[ctx.dataIndex] === max ? '#ef4444' : 'rgba(241,245,249,0.85)';
            },
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
  var ixcEmailPrev = (DATA && DATA.ixcData) || {};
  var ixcPrevDiario = diasPrev.reduce(function(s, d) {
    var v = savedPrev[d] !== undefined ? savedPrev[d] : (ixcEmailPrev[d] !== undefined ? ixcEmailPrev[d] : 0);
    return s + (+v || 0);
  }, 0);
  var ixcPrevTotalKey = 'ixc_total_' + ymPrev;
  var ixcPrevTotalSaved = localStorage.getItem(ixcPrevTotalKey);
  var ixcMesAccGlobal = (DATA && DATA.ixcMes) || {};
  var ixcPrev = ixcPrevTotalSaved !== null
    ? parseInt(ixcPrevTotalSaved, 10)
    : (ixcMesAccGlobal[ymPrev] !== undefined ? ixcMesAccGlobal[ymPrev] : ixcPrevDiario);
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

  // Datos IX compartidos por todas las sub-funciones
  var _ixcEmail  = (DATA && DATA.ixcData) || {};
  var _ixcMesAcc = (DATA && DATA.ixcMes)  || {};
  var _ixcKey    = 'ixc_' + ym;
  var _ixcSaved  = {};
  try { _ixcSaved = JSON.parse(localStorage.getItem(_ixcKey) || '{}'); } catch(e) {}
  // localStorage primero (override manual), luego dato del correo
  function ixcVal(iso) {
    if (_ixcSaved[iso] !== undefined) return _ixcSaved[iso];
    if (_ixcEmail[iso] !== undefined) return _ixcEmail[iso];
    return '';
  }

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

    var mesTotal = dias.reduce(function(s, iso) { return s + (+ixcVal(iso) || 0); }, 0);

    // Mes anterior: localStorage override > acumulado del email > vacío
    var keyPrevTotal   = 'ixc_total_' + ymPrev;
    var prevTotalSaved = localStorage.getItem(keyPrevTotal);
    var prevTotalVal   = prevTotalSaved !== null
      ? prevTotalSaved
      : (_ixcMesAcc[ymPrev] !== undefined ? String(_ixcMesAcc[ymPrev]) : '');

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
        var v       = ixcVal(iso);
        var deEmail = _ixcSaved[iso] === undefined && _ixcEmail[iso] !== undefined;
        var extraStyle = deEmail ? 'background:#EFF6FF;' : '';
        tr += '<td style="' + tdS + extraStyle + '">'
           + '<input type="number" min="0" style="' + SI + '" value="' + v + '" placeholder="—"'
           + ' data-iso="' + iso + '" data-key="' + _ixcKey + '" onchange="saveIXC(this)" oninput="saveIXC(this)"'
           + (deEmail ? ' title="Dato cargado desde correo Outlook"' : '') + '></td>';
      }
    });
    tr += '<td id="ixc-row-total" style="' + SV + 'background:' + BG + ';font-weight:700">' + (mesTotal || '—') + '</td>';
    return tr + '</tr>';
  }

  function buildMCIRow() {
    var BG       = '#ECFEFF';
    var ixcTotal = dias.reduce(function(s, iso) { return s + (+ixcVal(iso) || 0); }, 0);
    var ingTotal = dias.reduce(function(s, iso) { return s + (cntFn[iso] || 0); }, 0);
    var pctTotal = ixcTotal > 0 ? (ingTotal / ixcTotal * 100).toFixed(2) + '%' : '—';
    var tr = '<tr>';
    tr += '<td style="' + SL + 'background:' + BG + '">MCI: % ORs Incidentadas en el día</td>';
    tr += '<td style="' + SV + 'background:#EFF6FF;font-weight:700;border-right:2px solid #93C5FD">' + mciPrev + '</td>';
    dias.forEach(function(iso) {
      var ixc = +ixcVal(iso) || 0;
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

  // ── Extremos MCI (mayor y menor % del mes) ──────────────────────────────
  (function renderExtremosBlock() {
    var extremos = document.getElementById('mci-extremos');
    if (!extremos) return;

    var MESES_ESP2 = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    // Calcular MCI% por día para los días con datos completos
    var puntos = [];
    dias.forEach(function(iso) {
      if (isWE(iso) || isFut(iso)) return;
      var ixc = +ixcVal(iso) || 0;
      if (ixc === 0) return;
      var inc = cntFn[iso] || 0;
      puntos.push({ iso: iso, inc: inc, ixc: ixc, pct: inc / ixc * 100 });
    });

    if (puntos.length === 0) {
      extremos.innerHTML = '<p style="font-size:12px;color:#94A3B8;padding:8px 0">Sin datos IX para calcular extremos este mes.</p>';
      return;
    }

    puntos.sort(function(a, b) { return b.pct - a.pct; });
    var mayor = puntos[0];
    var menor = puntos[puntos.length - 1];

    function fmtFecha(iso) {
      var p = iso.split('-');
      return parseInt(p[2], 10) + ' ' + MESES_ESP2[+p[1]];
    }

    var maxPct = puntos[0].pct;
    var avgPct = puntos.reduce(function(s,p){ return s+p.pct; },0) / puntos.length;

    function gauge(pct, color) {
      var deg = Math.min(180, pct / Math.max(maxPct, 1) * 180);
      var rad = (deg - 90) * Math.PI / 180;
      var cx = 60, cy = 60, r = 48;
      var x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
      var arc = 'M ' + (cx-r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx+r) + ' ' + cy;
      var needle = 'M ' + cx + ' ' + cy + ' L ' + x.toFixed(1) + ' ' + y.toFixed(1);
      return '<svg width="120" height="68" viewBox="0 0 120 68">'
        + '<path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"/>'
        + '<path d="M12 60 A48 48 0 0 1 108 60" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round"'
        + '  stroke-dasharray="' + (150.8 * deg / 180).toFixed(1) + ' 150.8" opacity=".85"/>'
        + '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"'
        + '  stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>'
        + '<circle cx="60" cy="60" r="5" fill="' + color + '"/>'
        + '</svg>';
    }

    function card(tipo, punto, cfg) {
      var pctStr = punto.pct.toFixed(2) + '%';
      var diffAvg = (punto.pct - avgPct).toFixed(2);
      var diffSign = diffAvg > 0 ? '+' : '';
      var diffColor = tipo === 'mayor' ? cfg.text : '#16A34A';
      var uid = 'mci-ext-' + tipo;
      var html = '<div style="flex:1;min-width:260px;background:' + cfg.bg
               + ';border:1.5px solid ' + cfg.border
               + ';border-radius:16px;padding:20px 22px;display:flex;gap:16px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,.06)">'
               // left: gauge
               + '<div style="flex-shrink:0">' + gauge(punto.pct, cfg.accent) + '</div>'
               // right: info
               + '<div style="flex:1;min-width:0">'
               +   '<div style="font-size:10px;font-weight:800;color:' + cfg.text + ';text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">'
               +     cfg.emoji + ' ' + cfg.label + '</div>'
               +   '<div id="' + uid + '-num" style="font-size:32px;font-weight:900;color:' + cfg.text + ';line-height:1;font-variant-numeric:tabular-nums">0%</div>'
               +   '<div style="font-size:12px;font-weight:700;color:' + cfg.text + ';opacity:.8;margin-top:3px">' + fmtFecha(punto.iso) + '</div>'
               +   '<div style="font-size:11px;color:' + cfg.text + ';opacity:.65;margin-top:2px">'
               +     punto.inc + ' incidentadas de ' + punto.ixc + ' IX</div>'
               +   '<div style="margin-top:8px;font-size:10px;font-weight:700;color:' + diffColor + ';background:rgba(0,0,0,.06);display:inline-block;padding:2px 8px;border-radius:20px">'
               +     diffSign + diffAvg + '% vs promedio (' + avgPct.toFixed(2) + '%)</div>'
               + '</div>'
               + '</div>';
      // Animate counter
      setTimeout(function() {
        var el = document.getElementById(uid + '-num');
        if (!el) return;
        var start = 0, end = punto.pct, dur = 900, step = 16;
        var t = 0;
        var iv = setInterval(function() {
          t += step;
          var val = end * (1 - Math.pow(1 - t/dur, 3));
          el.textContent = val.toFixed(2) + '%';
          if (t >= dur) { el.textContent = end.toFixed(2) + '%'; clearInterval(iv); }
        }, step);
      }, 50);
      return html;
    }

    extremos.innerHTML =
      card('mayor', mayor, { bg:'#FEF2F2', border:'#FECACA', text:'#991B1B', accent:'#EF4444', emoji:'🔴', label:'Mayor MCI del mes' }) +
      card('menor', menor, { bg:'#F0FDF4', border:'#BBF7D0', text:'#166534', accent:'#22C55E', emoji:'🟢', label:'Menor MCI del mes' });
  })();

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
  var chartLabels = [], chartVals = [], chartColors = [];
  dias.forEach(function(iso) {
    if (isWE(iso) || isFut(iso)) return;
    var ixc = +ixcVal(iso) || 0;
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

  // ── Top 5 problemas recurrentes del mes ─────────────────────────────────
  (function renderTop5() {
    var el = document.getElementById('mci-top5');
    if (!el) return;

    // Agrupar por detalle (Estado Caso): contar en cuántos días distintos apareció
    var diasPorDetalle = {};   // detalle -> Set de fechas
    var totalPorDetalle = {};  // detalle -> conteo total de ORs

    RECORDS.filter(function(r) {
      return r.fn && r.fn.slice(0, 7) === ym && r.detalle;
    }).forEach(function(r) {
      var d = r.detalle.trim();
      if (!diasPorDetalle[d]) { diasPorDetalle[d] = {}; totalPorDetalle[d] = 0; }
      diasPorDetalle[d][r.fn] = true;
      totalPorDetalle[d]++;
    });

    // Ordenar por cantidad de días distintos desc, luego por total desc
    var ranking = Object.keys(diasPorDetalle).map(function(d) {
      return {
        detalle: d,
        dias:    Object.keys(diasPorDetalle[d]).length,
        total:   totalPorDetalle[d]
      };
    }).sort(function(a, b) {
      return b.dias !== a.dias ? b.dias - a.dias : b.total - a.total;
    }).slice(0, 5);

    if (ranking.length === 0) {
      el.innerHTML = '';
      return;
    }

    var maxDias = ranking[0].dias;
    var MEDAL   = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    var COLORS  = ['#DC2626','#EA580C','#D97706','#65A30D','#0284C7'];

    var rows = ranking.map(function(item, i) {
      var barPct = maxDias > 0 ? Math.round(item.dias / maxDias * 100) : 0;
      var color  = COLORS[i];
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F1F5F9">'
           + '<span style="font-size:16px;width:24px;text-align:center;flex-shrink:0">' + MEDAL[i] + '</span>'
           + '<div style="flex:1;min-width:0">'
           +   '<div style="font-size:12px;font-weight:600;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + item.detalle + '">' + item.detalle + '</div>'
           +   '<div style="margin-top:5px;height:6px;background:#F1F5F9;border-radius:3px;overflow:hidden">'
           +     '<div style="height:100%;width:' + barPct + '%;background:' + color + ';border-radius:3px;transition:width .4s"></div>'
           +   '</div>'
           + '</div>'
           + '<div style="text-align:right;flex-shrink:0">'
           +   '<div style="font-size:13px;font-weight:800;color:' + color + '">' + item.dias + ' días</div>'
           +   '<div style="font-size:10px;color:#94A3B8">' + item.total + ' ORs</div>'
           + '</div>'
           + '</div>';
    }).join('');

    el.innerHTML = '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.05);padding:18px 22px">'
      + '<div style="font-weight:700;color:#1E3A8A;font-size:12px;margin-bottom:4px">🔁 Top 5 — Problemas más recurrentes del mes</div>'
      + '<div style="font-size:10px;color:#94A3B8;margin-bottom:12px">Ordenados por cantidad de días distintos en que aparecieron</div>'
      + rows
      + '</div>';
  })();
}

/* ══════════════════════════════════
   JIRAS TAB
══════════════════════════════════ */
var _gjFp = null;   // flatpickr instance

function poblarFiltrosJiras() {
  var base = RECORDS.filter(function(r){ return isEnRevIT(r) && r.pen === 'Continuidad'; });
  var selCom = document.getElementById('gj-fil-com');
  if(!selCom) return;
  var coms = [...new Set(base.map(function(r){ return r.com||''; }).filter(Boolean))].sort();
  selCom.innerHTML = '<option value="">Todas las áreas</option>'
    + coms.map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('');
}

function gjGetRevisados() {
  try { return JSON.parse(localStorage.getItem('gj_revisados') || '{}'); } catch(e){ return {}; }
}
function gjSetRevisado(key, val) {
  var obj = gjGetRevisados();
  if(val) obj[key] = true; else delete obj[key];
  localStorage.setItem('gj_revisados', JSON.stringify(obj));
}
function gjToggle(el) {
  gjSetRevisado(el.dataset.rvkey, el.checked);
  renderJiras();
}

// ── Gestión Jiras — Filtro de fecha (Flatpickr multi-select) ─────────────────
var _gjFp = null;
function _gjIsoFecha(d) {
  var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function _initGjFechaPicker() {
  var el = document.getElementById('gj-fil-fecha');
  if(!el || _gjFp) return;
  // Fechas disponibles (registros En Revisión CO-IT + Continuidad)
  var fechasDisp = [];
  var _seenF = {};
  RECORDS.forEach(function(r){
    if(isEnRevIT(r) && r.pen==='Continuidad' && r.fn && !_seenF[r.fn]){
      _seenF[r.fn]=true; fechasDisp.push(r.fn);
    }
  });
  fechasDisp.sort();
  _gjFp = flatpickr(el, {
    mode: 'multiple',
    dateFormat: 'd/m/Y',
    disableMobile: true,
    locale: {
      firstDayOfWeek:1,
      weekdays:{shorthand:['Do','Lu','Ma','Mi','Ju','Vi','Sa'],longhand:['Domingo','Lunes','Martes','Mi\xe9rcoles','Jueves','Viernes','S\xe1bado']},
      months:{shorthand:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],longhand:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']}
    },
    onDayCreate: function(dObj, dStr, fpi, dayElem){
      var iso = _gjIsoFecha(dayElem.dateObj);
      if(fechasDisp.indexOf(iso)!==-1){
        dayElem.style.fontWeight='800';
        dayElem.style.color='#5B21B6';
        dayElem.style.background='#EDE9FE';
        dayElem.style.borderRadius='50%';
        dayElem.title='Tiene registros';
      }
    },
    onChange: function(){ renderJiras(); }
  });
}
function _gjLimpiarFiltros() {
  document.getElementById('gj-fil-com').value='';
  document.getElementById('gj-fil-dias').value='';
  if(_gjFp) _gjFp.clear();
  renderJiras();
}
function renderJiras() {
  var comFil   = (document.getElementById('gj-fil-com')||{}).value  || '';
  var diasFil  = (document.getElementById('gj-fil-dias')||{}).value || '';
  // Inicializar picker de fecha si aún no existe
  if(RECORDS.length && !_gjFp) _initGjFechaPicker();
  var _gjFechas = (_gjFp && _gjFp.selectedDates.length)
    ? _gjFp.selectedDates.map(_gjIsoFecha) : [];

  var _hoyMs = new Date().setHours(0,0,0,0);

  function _calcDias(r) {
    var f = r.fn || r.fo || '';
    if(!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return -1;
    var p = f.split('-');
    var cur = new Date(+p[0], +p[1]-1, +p[2]);
    cur.setHours(0,0,0,0);
    var end = new Date(_hoyMs);
    if(cur >= end) return 0;
    var count = 0;
    while(cur < end) {
      var dw = cur.getDay();
      if(dw !== 0 && dw !== 6) count++; // excluye sábado(6) y domingo(0)
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // Todos los registros base (sin filtro de días) para calcular KPIs
  var recsBase = RECORDS.filter(function(r){
    if(!isEnRevIT(r) || r.pen !== 'Continuidad') return false;
    if(comFil && (r.com||'') !== comFil) return false;
    if(_gjFechas.length && _gjFechas.indexOf(r.fn||'') === -1) return false;
    return true;
  });

  // Calcular conteos para KPI cards
  var kpi = {a:0, b:0, c:0, d:0};
  recsBase.forEach(function(r){
    var d = _calcDias(r);
    if(d >= 0  && d <= 5)  kpi.a++;
    else if(d >= 6  && d <= 9)  kpi.b++;
    else if(d >= 10 && d <= 15) kpi.c++;
    else if(d > 15)             kpi.d++;
  });
  var total = recsBase.length;
  var kpiEl = document.getElementById('gj-kpi-row');
  if(kpiEl) {
    var _kpiCfg = [
      { rng:'0-5',   val:kpi.a, label:'Al día',       sub:'0 – 5 días',       accent:'#16A34A', light:'#F0FDF4', ring:'#BBF7D0', icon:'✅' },
      { rng:'6-9',   val:kpi.b, label:'Atención',      sub:'6 – 9 días',       accent:'#2563EB', light:'#EFF6FF', ring:'#BFDBFE', icon:'🔵' },
      { rng:'10-15', val:kpi.c, label:'Urgente',       sub:'10 – 15 días',     accent:'#D97706', light:'#FFFBEB', ring:'#FDE68A', icon:'⚠️'  },
      { rng:'15+',   val:kpi.d, label:'Crítico',       sub:'Más de 15 días',   accent:'#DC2626', light:'#FEF2F2', ring:'#FECACA', icon:'🚨' },
    ];
    var maxVal = Math.max(kpi.a, kpi.b, kpi.c, kpi.d, 1);
    var _gjUid = 'gjkpi' + Date.now();

    function _gjKpi(cfg, idx) {
      var pct  = total > 0 ? Math.round(cfg.val / total * 100) : 0;
      var barW = Math.round(cfg.val / maxVal * 100);
      var sel  = diasFil === cfg.rng;
      var uid  = _gjUid + idx;
      // Circular SVG arc
      var r = 28, circ = 2 * Math.PI * r;
      var dash = (pct / 100 * circ).toFixed(1);
      return '<div data-gjrng="'+cfg.rng+'" style="'
        + 'background:'+(sel ? cfg.light : '#fff')+';'
        + 'border-radius:16px;padding:20px 18px 16px;cursor:pointer;position:relative;overflow:hidden;'
        + 'box-shadow:'+(sel ? '0 0 0 2.5px '+cfg.accent+', 0 4px 20px rgba(0,0,0,.10)' : '0 2px 10px rgba(0,0,0,.07)')+';'
        + 'transition:box-shadow .2s,background .2s;user-select:none">'
        // background blur circle
        + '<div style="position:absolute;top:-18px;right:-18px;width:90px;height:90px;border-radius:50%;background:'+cfg.ring+';opacity:.45;pointer-events:none"></div>'
        // top row
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
        +   '<div>'
        +     '<div style="font-size:10px;font-weight:800;color:'+cfg.accent+';text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">'+cfg.label+'</div>'
        +     '<div id="'+uid+'-num" style="font-size:36px;font-weight:900;color:'+(cfg.val===0?'#CBD5E1':cfg.accent)+';line-height:1;font-variant-numeric:tabular-nums">0</div>'
        +     '<div style="font-size:11px;color:#94A3B8;margin-top:4px;font-weight:600">'+cfg.sub+'</div>'
        +   '</div>'
        // donut
        +   '<svg width="68" height="68" viewBox="0 0 68 68" style="flex-shrink:0">'
        +     '<circle cx="34" cy="34" r="'+r+'" fill="none" stroke="#F1F5F9" stroke-width="8"/>'
        +     '<circle id="'+uid+'-arc" cx="34" cy="34" r="'+r+'" fill="none" stroke="'+cfg.accent+'" stroke-width="8"'
        +       ' stroke-linecap="round" stroke-dasharray="0 '+circ+'"'
        +       ' transform="rotate(-90 34 34)" style="transition:stroke-dasharray .8s cubic-bezier(.4,0,.2,1)"/>'
        +     '<text x="34" y="38" text-anchor="middle" font-size="14" font-weight="800" fill="'+(cfg.val===0?'#CBD5E1':cfg.accent)+'">'+pct+'%</text>'
        +   '</svg>'
        + '</div>'
        // bar
        + '<div style="margin-top:14px">'
        +   '<div style="height:5px;background:#F1F5F9;border-radius:10px;overflow:hidden">'
        +     '<div id="'+uid+'-bar" style="height:100%;width:0%;background:linear-gradient(90deg,'+cfg.accent+'99,'+cfg.accent+');border-radius:10px;transition:width .8s cubic-bezier(.4,0,.2,1)"></div>'
        +   '</div>'
        +   '<div style="display:flex;justify-content:space-between;margin-top:5px">'
        +     '<span style="font-size:10px;color:#94A3B8">del total: '+pct+'%</span>'
        +     '<span style="font-size:10px;font-weight:700;color:'+(sel?cfg.accent:'#94A3B8')+'">'+(sel?'▶ Activo':'clic para filtrar')+'</span>'
        +   '</div>'
        + '</div>'
        + '</div>';
    }

    kpiEl.innerHTML = _kpiCfg.map(_gjKpi).join('');

    // Animate after render
    setTimeout(function() {
      _kpiCfg.forEach(function(cfg, idx) {
        var uid = _gjUid + idx;
        var pct  = total > 0 ? Math.round(cfg.val / total * 100) : 0;
        var barW = Math.round(cfg.val / maxVal * 100);
        var r = 28, circ = 2 * Math.PI * r;
        var dash = (pct / 100 * circ).toFixed(1);
        // bar
        var barEl = document.getElementById(uid + '-bar');
        if (barEl) barEl.style.width = barW + '%';
        // arc
        var arcEl = document.getElementById(uid + '-arc');
        if (arcEl) arcEl.setAttribute('stroke-dasharray', dash + ' ' + circ.toFixed(1));
        // counter
        var numEl = document.getElementById(uid + '-num');
        if (numEl && cfg.val > 0) {
          var t = 0, dur = 700, step = 20;
          var iv = setInterval(function() {
            t += step;
            numEl.textContent = Math.min(cfg.val, Math.round(cfg.val * (1 - Math.pow(1 - t/dur, 3))));
            if (t >= dur) { numEl.textContent = cfg.val; clearInterval(iv); }
          }, step);
        }
      });
    }, 60);

    kpiEl.onclick = function(e) {
      var card = e.target.closest ? e.target.closest('[data-gjrng]') : null;
      if(!card) return;
      var s = document.getElementById('gj-fil-dias');
      var rng = card.getAttribute('data-gjrng');
      s.value = (s.value === rng ? '' : rng);
      renderJiras();
    };
  }

  var recs = recsBase.filter(function(r){
    if(!diasFil) return true;
    var d = _calcDias(r);
    if(diasFil === '0-5'   && !(d >= 0  && d <= 5))  return false;
    if(diasFil === '6-9'   && !(d >= 6  && d <= 9))  return false;
    if(diasFil === '10-15' && !(d >= 10 && d <= 15)) return false;
    if(diasFil === '15+'   && d <= 15)                return false;
    return true;
  });
  var revisados = gjGetRevisados();

  recs = recs.slice().sort(function(a, b) {
    var fa = a.fn || a.fo || '';
    var fb = b.fn || b.fo || '';
    return fa.localeCompare(fb);
  });

  var cntEl = document.getElementById('gj-count');
  if(cntEl) cntEl.textContent = recs.length + ' registros';

  var tbody = document.getElementById('gj-body');
  if(!tbody) return;
  var htmlRows = '';
  recs.forEach(function(r, idx) {
    var fechaRef = r.fn || r.fo || '';
    var fechaDisp = fechaRef ? fechaRef.split('-').reverse().join('/') : '—';
    var diasNum = _calcDias(r);
    var dias = diasNum >= 0 ? diasNum : '—';
    var urgColor = diasNum >= 30 ? '#DC2626' : diasNum >= 15 ? '#D97706' : '#16A34A';
    var urgBg    = diasNum >= 30 ? '#FEF2F2' : diasNum >= 15 ? '#FFFBEB' : '#F0FDF4';
    var marca  = extractBrand(r.marca) || r.marca || '—';
    var pais   = r.pais || '';
    var com    = r.com || '—';
    var est    = r.detalle || '—';
    var venta  = r.ov || '—';
    var ticket = r.ticket || venta;
    var rvKey  = ticket + '|' + venta;
    var checked = revisados[rvKey] ? 'checked' : '';
    var rowBg = revisados[rvKey] ? '#F0FDF4' : (idx%2===0 ? '#fff' : urgBg);
    var rvLabel = revisados[rvKey]
      ? '<span style="color:#16A34A;font-size:11px;font-weight:700">✔ Revisado</span>'
      : '<span style="color:#94A3B8;font-size:11px">Pendiente</span>';
    htmlRows += '<tr id="gjrow-'+idx+'" style="border-bottom:1px solid #F1F5F9;background:'+rowBg+'">'
      + '<td style="padding:8px 14px;text-align:center;white-space:nowrap">'
      +   '<label style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer">'
      +     '<input type="checkbox" '+checked+' data-rvkey="'+rvKey.replace(/"/g,'&quot;')+'" onchange="gjToggle(this)" style="width:17px;height:17px;cursor:pointer;accent-color:#16A34A">'
      +     rvLabel
      +   '</label>'
      + '</td>'
      + '<td style="padding:8px 14px;font-size:12px;font-weight:600;color:#1E293B;white-space:nowrap">'+ticket+'</td>'
      + '<td style="padding:8px 14px;font-size:11px;color:#475569;white-space:nowrap">'+marca+(pais?'<br><span style="color:#94A3B8">'+pais+'</span>':'')+'</td>'
      + '<td style="padding:8px 14px;font-size:11px;color:#475569;white-space:nowrap">'+com+'</td>'
      + '<td style="padding:8px 14px;font-size:12px;white-space:nowrap;color:#475569">'+fechaDisp+'</td>'
      + '<td style="padding:8px 14px;text-align:center"><span style="background:'+urgColor+';color:#fff;font-weight:700;font-size:11px;padding:3px 10px;border-radius:20px">'+dias+' días</span></td>'
      + '<td style="padding:8px 14px;font-size:11px;color:#1E40AF;font-weight:600;white-space:nowrap">'+venta+'</td>'
      + '<td style="padding:8px 14px;font-size:11px;color:#475569;max-width:280px">'+est+'</td>'
      + '</tr>';
  });
  tbody.innerHTML = htmlRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94A3B8">Sin registros</td></tr>';
}



function exportarJirasExcel() {
  var recs = RECORDS.filter(function(r){ return isEnRevIT(r) && r.pen === 'Continuidad'; });
  if(!recs.length){ alert('No hay datos para exportar.'); return; }
  var hoyMs = new Date().setHours(0,0,0,0);
  var rows = [['Ticket Jira','Marca','País','Comentario Continuidad','Fecha Escalamiento','Días Pendiente','Orden Afectada','Estado / Error']];
  recs.forEach(function(r){
    var fechaRef = r.fn || r.fo || '';
    var diasNum = 0;
    if(fechaRef && /^\d{4}-\d{2}-\d{2}$/.test(fechaRef)){
      var pts = fechaRef.split('-');
      diasNum = Math.max(0, Math.round((hoyMs - new Date(+pts[0],+pts[1]-1,+pts[2]).setHours(0,0,0,0)) / 86400000));
    }
    rows.push([
      r.ticket || r.ov || '',
      extractBrand(r.marca) || r.marca || '',
      r.pais || '',
      r.com || '',
      fechaRef ? fechaRef.split('-').reverse().join('/') : '',
      diasNum,
      r.ov || '',
      r.detalle || ''
    ]);
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gestión de Jiras');
  XLSX.writeFile(wb, 'Gestion_Jiras_' + new Date().toISOString().slice(0,10) + '.xlsx');
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
  if (tab === 'jiras') {
    var gjLoaded = document.getElementById('gj-fil-com') && document.getElementById('gj-fil-com').options.length > 1;
    if (RECORDS.length && !_gjFp) _initGjFechaPicker();
    if (!gjLoaded) poblarFiltrosJiras();
    renderJiras();
  }
  if (tab === 'horarios')   { if (typeof _jblStartClock === 'function') _jblStartClock(); }

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

/* ══════════════════════════════════
   HORARIOS JBL
══════════════════════════════════ */

// ══════════════════════════════════════════════════ HORARIOS JBL


// ── Pipeline alert ────────────────────────────────────────────────────────
var _JBL_STG_MIN  = {GT:28, MX:3, CR:29, CL:44, CO:21, PE:48, UY:57};
var _JBL_STG_FLAG = {
  GT:'<img src="https://flagcdn.com/28x21/gt.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  MX:'<img src="https://flagcdn.com/28x21/mx.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  CR:'<img src="https://flagcdn.com/28x21/cr.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  CL:'<img src="https://flagcdn.com/28x21/cl.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  CO:'<img src="https://flagcdn.com/28x21/co.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  PE:'<img src="https://flagcdn.com/28x21/pe.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">',
  UY:'<img src="https://flagcdn.com/28x21/uy.png" style="border-radius:2px;vertical-align:middle;margin-right:6px">'
};
var _JBL_STG_NAME = {GT:'Guatemala', MX:'México', CR:'Costa Rica', CL:'Chile', CO:'Colombia', PE:'Perú', UY:'Uruguay'};
var _JBL_CRONDRIVER_M = [64,184,304,424,544,664,784,904,1024,1144,1264,1384]; // 01:04,03:04…23:04 cada 2h
var _JBL_REIDX_G1 = [135,225,585,750,1305];  // 02:15,03:45,09:45,12:30,21:45 → MX CR GT
var _JBL_REIDX_G2 = [345,375,705,930];        // 05:45,06:15,11:45,15:30 → CO PE CL UY
var _JBL_GRP1 = ['MX','CR','GT'];

function _jblFmt(mins) {
  var h=Math.floor(mins/60)%24, m=mins%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

function _jblNextVisible(country, nowMins) {
  var stgMin = _JBL_STG_MIN[country];
  var reidx  = _JBL_GRP1.indexOf(country)!==-1 ? _JBL_REIDX_G1 : _JBL_REIDX_G2;

  // Next Cron Driver after now
  var cixcsAbs = null;
  for(var i=0;i<_JBL_CRONDRIVER_M.length;i++){
    if(_JBL_CRONDRIVER_M[i]>nowMins){cixcsAbs=_JBL_CRONDRIVER_M[i];break;}
  }
  if(cixcsAbs===null) cixcsAbs=_JBL_CRONDRIVER_M[0]+1440; // tomorrow

  // Next STG after Cron Driver
  var baseH = Math.floor(cixcsAbs/60);
  var baseMod = cixcsAbs%60;
  var stgAbs = stgMin>baseMod ? baseH*60+stgMin : (baseH+1)*60+stgMin;

  // Next Reindexado after STG
  var dayBase = Math.floor(stgAbs/1440)*1440;
  var reidxAbs = null;
  for(var j=0;j<reidx.length;j++){
    var c=dayBase+reidx[j];
    if(c>stgAbs){reidxAbs=c;break;}
  }
  if(reidxAbs===null) reidxAbs=dayBase+1440+reidx[0]; // tomorrow

  return {c:cixcsAbs, s:stgAbs, r:reidxAbs, w:reidxAbs-nowMins};
}

function _jblUpdateAlert(nowMins, activePais) {
  var el=document.getElementById('jbl-alert');
  if(!el) return;
  var countries = activePais==='ALL'
    ? ['GT','MX','CR','CL','CO','PE','UY']
    : [activePais];
  var html='';
  countries.forEach(function(c,idx){
    var v=_jblNextVisible(c,nowMins);
    var urgent = v.w<=45;
    var rowBg  = urgent ? '#FFFBEB' : (idx%2===0?'#F8FAFC':'#fff');
    var wBg    = urgent ? '#D97706' : '#2563EB';
    var wText  = v.w >= 1440 ? 'mañana' : (v.w>60 ? Math.floor(v.w/60)+'h '+v.w%60+'min' : v.w+' min');
    var border = idx>0?'border-top:1px solid #F1F5F9':'';
    html+='<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;background:'+rowBg+';'+border+';flex-wrap:wrap">';
    html+='<div style="display:flex;align-items:center;gap:7px;min-width:130px">';
    html+=_JBL_STG_FLAG[c];
    html+='<span style="font-weight:700;font-size:13px;color:#1E293B">'+_JBL_STG_NAME[c]+'</span>';
    html+='</div>';
    html+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1">';
    html+='<span style="background:#EDE9FE;color:#6D28D9;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">⚙️ Cron Driver '+_jblFmt(v.c)+'</span>';
    html+='<span style="color:#CBD5E1;font-size:14px">→</span>';
    html+='<span style="background:#DBEAFE;color:#1D4ED8;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">📡 STG '+_jblFmt(v.s)+'</span>';
    html+='<span style="color:#CBD5E1;font-size:14px">→</span>';
    html+='<span style="background:#DCFCE7;color:#15803D;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">🔄 Front '+_jblFmt(v.r)+'</span>';
    html+='</div>';
    html+='<span style="background:'+wBg+';color:#fff;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;white-space:nowrap;margin-left:auto">⏱ '+wText+'</span>';
    html+='</div>';
  });
  el.innerHTML=html;
}

var _jblActiveSection = null;
function _jblFlowClick(nodeEl, sectionId) {
  // Reset all nodes
  document.querySelectorAll('.jbl-flow-node').forEach(function(n) {
    n.style.transform = '';
    n.style.boxShadow = '';
    n.style.opacity = '0.6';
  });
  // Activate clicked node
  nodeEl.style.transform = 'translateY(-4px)';
  nodeEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
  nodeEl.style.opacity = '1';
  // Reset all sections
  document.querySelectorAll('.jbl-section').forEach(function(s) {
    s.style.opacity = '0.35';
    s.style.transition = 'all .3s';
    s.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
  });
  // Highlight target section
  var sec = document.getElementById(sectionId);
  if (sec) {
    sec.style.opacity = '1';
    sec.style.boxShadow = '0 0 0 3px #2563EB, 0 8px 28px rgba(37,99,235,0.25)';
    setTimeout(function(){ sec.scrollIntoView({behavior:'smooth', block:'start'}); }, 100);
  }
  var hint = document.getElementById('jbl-flow-hint');
  if (hint) hint.textContent = 'Haz clic en 🌎 Todos o en otro proceso para cambiar la selección';
  _jblActiveSection = sectionId;
}

var _jblClockInterval = null;
var _jblPaisActivo = 'ALL';
var _JBL_DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var _JBL_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _jblFiltrar(codigo) {
  _jblPaisActivo = codigo;
  // Actualizar botones
  document.querySelectorAll('.jbl-country-btn').forEach(function(b) {
    var isActive = b.id === 'jbl-btn-' + codigo;
    b.style.background = isActive ? '#1E3A5F' : '#fff';
    b.style.color = isActive ? '#fff' : '#374151';
    b.style.border = isActive ? '1.5px solid #1E3A5F' : '1.5px solid #E2E8F0';
  });
  // Filtrar filas con data-paises
  document.querySelectorAll('tr[data-paises]').forEach(function(row) {
    if (codigo === 'ALL') {
      row.style.display = '';
    } else {
      var paises = row.getAttribute('data-paises').split(' ');
      row.style.display = paises.indexOf(codigo) !== -1 ? '' : 'none';
    }
  });
  _jblUpdateAlert(new Date().getHours()*60+new Date().getMinutes(), codigo);
  // Si se selecciona "Todos", resetear resaltado del flujo
  if (codigo === 'ALL') {
    document.querySelectorAll('.jbl-flow-node').forEach(function(n) {
      n.style.transform = '';
      n.style.boxShadow = '';
      n.style.opacity = '';
    });
    document.querySelectorAll('.jbl-section').forEach(function(s) {
      s.style.opacity = '';
      s.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
    });
    var hint = document.getElementById('jbl-flow-hint');
    if (hint) hint.textContent = 'Selecciona un proceso para resaltar su tabla';
  }
}

function _jblStartClock() {
  _jblTickClock();
  if (!_jblClockInterval) {
    _jblClockInterval = setInterval(_jblTickClock, 1000);
  }
}

function _jblTickClock() {
  var now = new Date();
  var h = String(now.getHours()).padStart(2,'0');
  var m = String(now.getMinutes()).padStart(2,'0');
  var s = String(now.getSeconds()).padStart(2,'0');
  var el = document.getElementById('jbl-clock-time');
  if (el) el.textContent = h + ':' + m + ':' + s;
  var elD = document.getElementById('jbl-clock-date');
  if (elD) elD.textContent = _JBL_DIAS[now.getDay()] + ' ' + now.getDate() + ' de ' + _JBL_MESES[now.getMonth()];

  var nowMins = now.getHours() * 60 + now.getMinutes();

  // IWS: ventana 02:00-03:00
  var iwsSt = document.getElementById('iws-status');
  if (iwsSt) {
    if (nowMins >= 120 && nowMins < 180) {
      iwsSt.innerHTML = '<span style="background:#16A34A;color:#fff;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">🟢 Ejecutando</span>';
    } else if (nowMins < 120) {
      var minLeft = 120 - nowMins;
      iwsSt.innerHTML = '<span style="background:#F1F5F9;color:#64748B;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600">⏱ En ' + minLeft + ' min</span>';
    } else {
      iwsSt.innerHTML = '<span style="background:#DCFCE7;color:#15803D;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">✅ Ejecutado hoy</span>';
    }
  }

  // STG: recurrente por minuto
  var curMin = now.getMinutes();
  document.querySelectorAll('#jbl-tbody tr[data-min]').forEach(function(row) {
    var jobMin = parseInt(row.getAttribute('data-min'), 10);
    var nextCell = row.querySelector('.jbl-next');
    var statusCell = row.querySelector('.jbl-status');
    if (!nextCell || !statusCell) return;
    var diff = (jobMin - curMin + 60) % 60;
    var totalMins = now.getHours() * 60 + now.getMinutes() + diff;
    var nextStr = String(Math.floor(totalMins/60)%24).padStart(2,'0') + ':' + String(totalMins%60).padStart(2,'0');
    if (diff === 0) {
      row.style.background='#ECFDF5';
      nextCell.textContent = nextStr;
      statusCell.innerHTML='<span style="background:#16A34A;color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">🟢 Ejecutando</span>';
    } else if (diff <= 5) {
      row.style.background='#FFFBEB';
      nextCell.textContent = nextStr + ' (en ' + diff + ' min)';
      statusCell.innerHTML='<span style="background:#D97706;color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">⏳ En ' + diff + ' min</span>';
    } else {
      row.style.background='';
      nextCell.textContent = nextStr + ' (en ' + diff + ' min)';
      statusCell.innerHTML='<span style="background:#F1F5F9;color:#64748B;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600">⏱ ' + diff + ' min</span>';
    }
  });

  // Tablas de horarios fijos (Cron Driver y From)
  function _tickFixed(tbodyId, nxtClass, stClass) {
    document.querySelectorAll('#'+tbodyId+' tr[data-hhmm]').forEach(function(row) {
      var p = row.getAttribute('data-hhmm').split(':');
      var jobM = parseInt(p[0],10)*60+parseInt(p[1],10);
      var diff = jobM - nowMins;
      var nxt = row.querySelector('.'+nxtClass);
      var st = row.querySelector('.'+stClass);
      if(!nxt||!st) return;
      var lbl = row.getAttribute('data-hhmm');
      if(diff===0){row.style.background='#ECFDF5';nxt.textContent=lbl+' (ahora)';st.innerHTML='<span style="background:#16A34A;color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">🟢 Ejecutando</span>';}
      else if(diff>0&&diff<=15){row.style.background='#FFFBEB';nxt.textContent=lbl+' (en '+diff+' min)';st.innerHTML='<span style="background:#D97706;color:#fff;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">⏳ En '+diff+' min</span>';}
      else if(diff>0){var fmtD=diff>=60?(Math.floor(diff/60)+'h '+(diff%60>0?diff%60+'min':'')):diff+' min';row.style.background='';nxt.textContent=lbl+' (en '+fmtD+')';st.innerHTML='<span style="background:#F1F5F9;color:#64748B;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600">⏱ '+fmtD+'</span>';}
      else{row.style.background='#F8FAFC';nxt.textContent='Mañana '+lbl;st.innerHTML='<span style="background:#DCFCE7;color:#15803D;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">✅ Ejecutado</span>';}
    });
  }
  _tickFixed('crondriver-tbody','crondriver-next','crondriver-status');
  _tickFixed('reidx-tbody','reidx-next','reidx-status');
  _jblUpdateAlert(nowMins, _jblPaisActivo);

  // ── Flow node badges: next country to execute ──────────────────────────
  (function(){
    var flagImg = function(cc,w,h){
      return '<img src="https://flagcdn.com/'+(w||20)+'x'+(h||15)+'/'+cc.toLowerCase()+'.png" style="border-radius:2px;vertical-align:middle">';
    };
    var pill = function(bg,fg,txt){
      return '<span style="background:'+bg+';color:'+fg+';border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700">'+txt+'</span>';
    };

    // IWS badge
    var bI = document.getElementById('jbl-flow-badge-iws');
    if(bI){
      if(nowMins>=120 && nowMins<180){
        bI.innerHTML='<div style="text-align:center">'+pill('#16A34A','#fff','🟢 Ejecutando')+'</div>';
      } else {
        var nextIws = nowMins<120 ? 120 : 120+1440;
        var dI = nextIws - nowMins;
        bI.innerHTML='<div style="text-align:center">'+pill('#FEF3C7','#92400E','⏳ En '+(dI>60?Math.floor(dI/60)+'h '+dI%60+'m':dI+' min'))+'</div>';
      }
    }

    // Cron Driver badge (next execution, all countries)
    var bC = document.getElementById('jbl-flow-badge-crondriver');
    if(bC){
      var nextC = null;
      for(var i=0;i<_JBL_CRONDRIVER_M.length;i++){
        if(_JBL_CRONDRIVER_M[i]>nowMins){nextC=_JBL_CRONDRIVER_M[i];break;}
      }
      if(nextC===null) nextC = _JBL_CRONDRIVER_M[0]+1440;
      var dC = nextC - nowMins;
      if(dC<=2){
        bC.innerHTML='<div style="text-align:center">'+pill('#16A34A','#fff','🟢 Ejecutando')+'</div>';
      } else {
        bC.innerHTML='<div style="text-align:center">'+pill('#EDE9FE','#6D28D9','Próx '+_jblFmt(nextC%1440))+'</div>';
      }
    }

    // STG badge: next country by minute-in-hour
    var bS = document.getElementById('jbl-flow-badge-stg');
    if(bS){
      var curMin = nowMins % 60;
      var bestC=null, bestW=999;
      var STGK = Object.keys(_JBL_STG_MIN);
      for(var j=0;j<STGK.length;j++){
        var c=STGK[j];
        var w = (_JBL_STG_MIN[c] - curMin + 60) % 60;
        if(w===0) w=60; // just ran this minute
        if(w<bestW){bestW=w;bestC=c;}
      }
      // recalc with diff=0 meaning "right now"
      bestC=null; bestW=999;
      for(var k=0;k<STGK.length;k++){
        var cc2=STGK[k];
        var w2=(_JBL_STG_MIN[cc2]-curMin+60)%60;
        if(w2<bestW){bestW=w2;bestC=cc2;}
      }
      if(bestC){
        var lS = bestW===0?'🟢 Ahora':'En '+bestW+' min';
        var bgS = bestW===0?'#16A34A':(bestW<=5?'#D97706':'#DBEAFE');
        var fgS = bestW<=5?'#fff':'#1D4ED8';
        bS.innerHTML='<div style="display:flex;align-items:center;justify-content:center;gap:4px">'
          +flagImg(bestC,20,15)
          +'<span style="background:'+bgS+';color:'+fgS+';border-radius:10px;padding:2px 7px;font-size:10px;font-weight:700">'+lS+'</span>'
          +'</div>';
      }
    }

    // Reindexado badge: next group
    var bR = document.getElementById('jbl-flow-badge-reidx');
    if(bR){
      var allSlots=[];
      for(var a=0;a<_JBL_REIDX_G1.length;a++) allSlots.push({m:_JBL_REIDX_G1[a],g:1});
      for(var b=0;b<_JBL_REIDX_G2.length;b++) allSlots.push({m:_JBL_REIDX_G2[b],g:2});
      allSlots.sort(function(x,y){return x.m-y.m;});
      var nxSlot=null;
      for(var s=0;s<allSlots.length;s++){if(allSlots[s].m>nowMins){nxSlot=allSlots[s];break;}}
      if(!nxSlot) nxSlot=allSlots[0];
      var grp = nxSlot.g===1 ? ['mx','cr','gt'] : ['co','pe','cl','uy'];
      var dR = (nxSlot.m - nowMins + 1440) % 1440;
      var lR = dR<=2?'🟢 Ahora':(dR>60?'En '+Math.floor(dR/60)+'h '+dR%60+'m':'En '+dR+' min');
      var bgR = dR<=2?'#16A34A':(dR<=15?'#D97706':'#DCFCE7');
      var fgR = dR<=2||dR<=15?'#fff':'#15803D';
      var fHtml='';
      for(var f=0;f<grp.length;f++) fHtml+=flagImg(grp[f],20,15);
      bR.innerHTML='<div style="display:flex;align-items:center;justify-content:center;gap:3px;flex-wrap:wrap">'
        +fHtml
        +'</div>'
        +'<div style="text-align:center;margin-top:3px">'
        +'<span style="background:'+bgR+';color:'+fgR+';border-radius:10px;padding:2px 7px;font-size:10px;font-weight:700">'+lR+'</span>'
        +'</div>';
    }
  })();
}

// ── Consultor de visibilidad de precios ────────────────────────────────────
var _JBL_PAISES_ALIAS = {
  'CO':['colombia'],'MX':['mexico','méxico'],'GT':['guatemala'],
  'CR':['costa rica','costarica'],'CL':['chile'],'PE':['peru','perú'],'UY':['uruguay']
};
var _JBL_PAISES_NOMBRE = {
  'CO':'Colombia 🇨🇴','MX':'México 🇲🇽','GT':'Guatemala 🇬🇹',
  'CR':'Costa Rica 🇨🇷','CL':'Chile 🇨🇱','PE':'Perú 🇵🇪','UY':'Uruguay 🇺🇾'
};

function _jblChatDetectarPais(txt) {
  var t = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  var keys = Object.keys(_JBL_PAISES_ALIAS);
  for (var i=0; i<keys.length; i++) {
    var aliases = _JBL_PAISES_ALIAS[keys[i]];
    for (var j=0; j<aliases.length; j++) {
      if (t.indexOf(aliases[j].normalize('NFD').replace(/[̀-ͯ]/g,'')) !== -1) return keys[i];
    }
  }
  return null;
}

// Extrae "HH:MM" del texto (ej: "a las 10:40" → 640 mins)
function _jblChatParseHora(txt) {
  var m = txt.match(/(?:a\s+las?\s+)?(\d{1,2}):(\d{2})/i);
  if (m) {
    var h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && mn >= 0 && mn <= 59) return h * 60 + mn;
  }
  return null;
}

// Encuentra el siguiente Cron Driver después de afterMins (puede ser >1440 para día siguiente)
function _jblNextCronDriverAfter(afterMins) {
  var dayOffset = Math.floor(afterMins / 1440) * 1440;
  var remainder = afterMins % 1440;
  for (var i=0; i<_JBL_CRONDRIVER_M.length; i++) {
    if (_JBL_CRONDRIVER_M[i] > remainder) return dayOffset + _JBL_CRONDRIVER_M[i];
  }
  return dayOffset + 1440 + _JBL_CRONDRIVER_M[0]; // siguiente día
}

// Calcula pipeline completo desde un punto de inicio arbitrario
function _jblPipelineDesde(country, startMins) {
  var stgMin = _JBL_STG_MIN[country];
  var reidx  = _JBL_GRP1.indexOf(country) !== -1 ? _JBL_REIDX_G1 : _JBL_REIDX_G2;
  var cdAbs  = _jblNextCronDriverAfter(startMins);
  var baseH  = Math.floor(cdAbs / 60);
  var baseMod = cdAbs % 60;
  var stgAbs = stgMin > baseMod ? baseH*60 + stgMin : (baseH+1)*60 + stgMin;
  var dayBase = Math.floor(stgAbs / 1440) * 1440;
  var reidxAbs = null;
  for (var j=0; j<reidx.length; j++) {
    if (dayBase + reidx[j] > stgAbs) { reidxAbs = dayBase + reidx[j]; break; }
  }
  if (reidxAbs === null) reidxAbs = dayBase + 1440 + reidx[0];
  return { c: cdAbs, s: stgAbs, r: reidxAbs };
}

function _jblChatMsgUsuario(txt) {
  var h = document.getElementById('jbl-chat-history');
  var d = document.createElement('div');
  d.style.cssText = 'align-self:flex-end;background:#1E293B;color:#fff;border-radius:10px 10px 2px 10px;padding:9px 14px;font-size:12px;max-width:80%;word-break:break-word';
  d.textContent = txt;
  h.appendChild(d); h.scrollTop = h.scrollHeight;
}

function _jblChatMsgBot(html) {
  var h = document.getElementById('jbl-chat-history');
  var d = document.createElement('div');
  d.style.cssText = 'background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px 10px 10px 2px;padding:10px 14px;font-size:12px;color:#0369A1;max-width:85%;line-height:1.6';
  d.innerHTML = html; h.appendChild(d); h.scrollTop = h.scrollHeight;
  // Si el panel está cerrado, mostrar badge en el botón
  if (!_jblWidgetOpen) {
    var badge = document.getElementById('jbl-widget-badge');
    if (badge) badge.style.display = 'block';
  }
}

function _jblChatEnviar() {
  var input = document.getElementById('jbl-chat-input');
  var txt = (input.value || '').trim();
  if (!txt) return;
  _jblChatMsgUsuario(txt);
  input.value = '';

  var pais = _jblChatDetectarPais(txt);
  if (!pais) {
    _jblChatMsgBot('No identifiqué el país en tu mensaje 🤔<br>¿Para qué país es? <em>Colombia, México, Guatemala, Costa Rica, Chile, Perú o Uruguay.</em>');
    return;
  }

  var now = new Date();
  var actualNowMins = now.getHours() * 60 + now.getMinutes();
  var t = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  // ── Detección: ¿es consulta de STOCK o de PRECIO? ──────────────────────
  var esStock = /\bstock\b|inventario|unidades|disponibilidad|cantidad/.test(t);

  var horaIndicada = _jblChatParseHora(txt);
  var refMins = (horaIndicada !== null) ? horaIndicada : actualNowMins;
  var horaRef = (horaIndicada !== null)
    ? '<br><br>🕐 <em>Calculado desde las <strong>' + _jblFmt(horaIndicada) + '</strong> indicadas en tu mensaje.</em>'
    : '';

  // ════════════════════════════════════════════════════════════════════════
  // FLUJO STOCK — lectura IWS cada 15 min (independiente de precios)
  // ════════════════════════════════════════════════════════════════════════
  if (esStock) {
    // Próximo slot de 15 min tras refMins
    var nextSlot = Math.floor(refMins / 15) * 15 + 15;
    var slotH = _jblFmt(nextSlot % 1440);
    var diasS  = Math.floor(nextSlot / 1440);
    var cuandoS = diasS === 0 ? 'hoy a las <strong>' + slotH + '</strong>'
      : diasS === 1 ? 'mañana a las <strong>' + slotH + '</strong>'
      : 'en ' + diasS + ' días a las <strong>' + slotH + '</strong>';
    var esperaS = Math.max(0, nextSlot - actualNowMins);
    var esperaSTxt = esperaS <= 0 ? 'Menos de 1 min'
      : esperaS >= 60 ? Math.floor(esperaS/60) + 'h ' + (esperaS%60) + ' min'
      : esperaS + ' min';

    _jblChatMsgBot(
      '📦 Para <strong>' + _JBL_PAISES_NOMBRE[pais] + '</strong>, el stock estará actualizado en el front ' + cuandoS + '.'
      + '<br><br>📌 <strong>Pipeline stock:</strong><br>'
      + '&nbsp;&nbsp;📥 IWS lee stock: <strong>cada 15 min (:00 · :15 · :30 · :45)</strong>'
      + '<br>&nbsp;&nbsp;⏭ Próxima lectura: <strong>' + slotH + '</strong>'
      + '<br><br>⏱ Tiempo de espera estimado: <strong>' + esperaSTxt + '</strong>'
      + '<br><br>ℹ️ <em>El stock se actualiza de forma independiente a los horarios de precios.</em>'
      + horaRef
    );
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // FLUJO PRECIO — pipeline Cron Driver → STG → Reindexado
  // ════════════════════════════════════════════════════════════════════════
  var esNuevo = /nuevo|nueva|new product|producto nuevo/.test(t);
  var v, iwsLinea = '';

  if (esNuevo) {
    var IWS_FIN = 180; // 03:00
    if (refMins < IWS_FIN) {
      v = _jblPipelineDesde(pais, IWS_FIN);
      iwsLinea = '<br><br>🏭 <em>Producto nuevo: IWS procesará el producto esta noche (02:00–03:00). El pipeline inicia después de que IWS finalice.</em>';
    } else {
      v = _jblPipelineDesde(pais, 1440 + IWS_FIN);
      iwsLinea = '<br><br>🏭 <em>Producto nuevo: IWS ya ejecutó hoy (02:00–03:00). El producto entrará en el ciclo de IWS <strong>mañana</strong>.</em>';
    }
  } else {
    v = _jblPipelineDesde(pais, refMins);
  }

  var cronH  = _jblFmt(v.c % 1440);
  var stgH   = _jblFmt(v.s % 1440);
  var reidxH = _jblFmt(v.r % 1440);
  var diasExtra = Math.floor(v.r / 1440);
  var cuandoTxt = diasExtra === 0 ? 'hoy a las <strong>' + reidxH + '</strong>'
    : diasExtra === 1 ? 'mañana a las <strong>' + reidxH + '</strong>'
    : 'en ' + diasExtra + ' días a las <strong>' + reidxH + '</strong>';
  var espera = Math.max(0, v.r - actualNowMins);
  var esperaTxt = espera === 0 ? 'Menos de 1 min'
    : espera >= 60 ? Math.floor(espera/60) + 'h ' + (espera%60) + ' min'
    : espera + ' min';
  var iwsPipelineTag = esNuevo ? '🏭 IWS (03:00) &rarr; ' : '';

  _jblChatMsgBot(
    '✅ Para <strong>' + _JBL_PAISES_NOMBRE[pais] + '</strong>, el precio estará visible en el front ' + cuandoTxt + '.'
    + '<br><br>📌 <strong>Pipeline precio:</strong><br>'
    + '&nbsp;&nbsp;' + iwsPipelineTag
    + '⚙️ Cron Driver: <strong>' + cronH + '</strong>'
    + ' &rarr; 📡 STG: <strong>' + stgH + '</strong>'
    + ' &rarr; 🔄 Reindexado: <strong>' + reidxH + '</strong>'
    + '<br><br>⏱ Tiempo de espera estimado: <strong>' + esperaTxt + '</strong>'
    + horaRef
    + iwsLinea
  );
}


// ── Widget flotante JBL ────────────────────────────────────────────────────
var _jblWidgetOpen = false;
var _jblBubbleTimer = null;

// Animación de entrada de la burbuja
(function(){
  var s = document.createElement('style');
  s.textContent = '@keyframes jblBubblePop{from{opacity:0;transform:translateY(8px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}';
  document.head.appendChild(s);
})();

function _jblBubbleDismiss() {
  var b = document.getElementById('jbl-widget-bubble');
  if (b) b.style.display = 'none';
  clearTimeout(_jblBubbleTimer);
}

function _jblWidgetToggle() {
  _jblBubbleDismiss(); // ocultar burbuja al abrir
  _jblWidgetOpen = !_jblWidgetOpen;
  var panel = document.getElementById('jbl-widget-panel');
  if (panel) panel.style.display = _jblWidgetOpen ? 'flex' : 'none';
  if (_jblWidgetOpen) {
    var badge = document.getElementById('jbl-widget-badge');
    if (badge) badge.style.display = 'none';
    var hist = document.getElementById('jbl-chat-history');
    if (hist) setTimeout(function(){ hist.scrollTop = hist.scrollHeight; }, 50);
    var inp = document.getElementById('jbl-chat-input');
    if (inp) setTimeout(function(){ inp.focus(); }, 80);
  }
}

function _jblWidgetShow(visible) {
  var wrap = document.getElementById('jbl-widget-wrap');
  if (!wrap) return;
  wrap.style.display = visible ? 'flex' : 'none';
  if (visible) {
    // Mostrar burbuja al entrar a la pestaña, desaparece sola a los 6 s
    var b = document.getElementById('jbl-widget-bubble');
    if (b) {
      b.style.display = 'flex';
      b.style.animation = 'none';
      void b.offsetWidth; // reflow para reiniciar animación
      b.style.animation = 'jblBubblePop .35s ease';
      clearTimeout(_jblBubbleTimer);
      _jblBubbleTimer = setTimeout(function(){ _jblBubbleDismiss(); }, 6000);
    }
  }
  if (!visible && _jblWidgetOpen) {
    _jblWidgetOpen = false;
    var panel = document.getElementById('jbl-widget-panel');
    if (panel) panel.style.display = 'none';
  }
  if (!visible) _jblBubbleDismiss();
}

