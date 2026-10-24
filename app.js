'use strict';

// Datos: todo se guarda en este dispositivo (localStorage), así funciona sin conexión.
const STORAGE_KEY = 'miruta-v1';
const CATEGORIES = [
  'Atracción turística', 'Compras', 'Lavandería', 'Parking', 'Restaurante',
  'Supermercado', 'Telefonía', 'Transporte', 'Visa', 'Otros',
].sort(new Intl.Collator('es').compare);
const IDEA_TYPES = { turismo: 'Turismo', restauracion: 'Restauración', transporte: 'Transporte' };
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const eurFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

let db = loadDb();
let current = null;              // viaje abierto
let ideaFilter = 'todas';
let listSort = 'start';          // orden del listado de viajes: 'start' o 'name'
let sheet = null;                // ventana de elemento abierta: { key, isNew, draft }
let tripDialogState = null;      // ventana de viaje abierta: { editing, range }
const calendarMonth = new Map(); // clave de calendario -> mes mostrado ('YYYY-MM')

// ---------- Utilidades ----------
const $ = (selector) => document.querySelector(selector);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => eurFormat.format(n || 0);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
// "1 jun": día y tres primeras letras del mes en minúsculas, sin año
const fmtDayMonth = (iso) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
};
const toDayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const daysBetween = (a, b) => (a && b ? toDayNumber(b) - toDayNumber(a) : null);
const nightsBetween = (a, b) => { const diff = daysBetween(a, b); return diff > 0 ? diff : 0; };
const tripDays = (t) => { const diff = daysBetween(t.start, t.end); return diff === null || diff < 0 ? 0 : diff + 1; };

function loadDb() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && Array.isArray(data.trips) ? data : { trips: [] };
  } catch {
    return { trips: [] };
  }
}

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

// ---------- Calendario de rango (viajes y alojamientos) ----------
// range = { checkin, checkout }; key = clave para recordar el mes que se muestra
function shownMonth(range, key) {
  if (calendarMonth.has(key)) return calendarMonth.get(key);
  if (range.checkin) return range.checkin.slice(0, 7);
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Primer toque = entrada, segundo toque = salida
function pickDay(range, iso) {
  if (!range.checkin || range.checkout || iso <= range.checkin) {
    range.checkin = iso;
    range.checkout = '';
  } else {
    range.checkout = iso;
  }
}

function calendarHtml(range, key) {
  const ym = shownMonth(range, key);
  const [y, m] = ym.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // la semana empieza en lunes
  const days = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: offset }, () => '<span></span>');
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const classes = ['day'];
    if (iso === range.checkin) classes.push('start');
    if (iso === range.checkout) classes.push('end');
    if (range.checkin && range.checkout && iso > range.checkin && iso < range.checkout) classes.push('between');
    cells.push(`<button type="button" class="${classes.join(' ')}" data-day="${iso}">${d}</button>`);
  }
  const monthTitle = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const title = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);
  return `
    <div class="cal">
      <div class="cal-head">
        <button type="button" data-nav="-1" aria-label="Mes anterior">‹</button>
        <span>${title}</span>
        <button type="button" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="wd">${d}</span>`).join('')}
        ${cells.join('')}
      </div>
    </div>`;
}

// ---------- Pantalla 1: listado de viajes ----------
const byStart = (a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name, 'es');
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

function tripCardHtml(t) {
  const days = tripDays(t);
  return `
    <div class="trip-card" data-trip="${t.id}">
      <a class="trip-main" href="#/trip/${t.id}">
        <strong>${esc(t.name)}</strong>
        <span class="muted">${fmtDayMonth(t.start)} - ${fmtDayMonth(t.end)}${days ? ` · ${days} días` : ''}</span>
      </a>
      <div class="trip-actions">
        <button type="button" data-edit>Editar</button>
        <button type="button" class="danger" data-delete>Eliminar</button>
      </div>
    </div>`;
}

function renderList() {
  const trips = [...db.trips].sort(listSort === 'name' ? byName : byStart);
  $('#tripList').innerHTML = trips.length
    ? trips.map(tripCardHtml).join('')
    : '<p class="empty">Aún no tienes viajes. Pulsa + para crear el primero.</p>';
  document.querySelectorAll('#sortBar button').forEach((b) => b.classList.toggle('on', b.dataset.sort === listSort));
}

function createTrip(name, start, end) {
  const trip = { id: uid(), name, start, end, transports: [], stays: [], todos: [], expenses: [], ideas: [], notes: '' };
  db.trips.push(trip);
  save();
  return trip;
}

// ---------- Ventana de viaje (nuevo o editar) ----------
function refreshTripDialog() {
  const { range } = tripDialogState;
  $('#tripCal').innerHTML = calendarHtml(range, 'trip');
  let text = 'Elige la fecha de inicio y la de regreso';
  if (range.checkin && range.checkout) {
    const days = daysBetween(range.checkin, range.checkout) + 1;
    text = `${fmtDayMonth(range.checkin)} - ${fmtDayMonth(range.checkout)} · ${days} días`;
  } else if (range.checkin) {
    text = `Inicio: ${fmtDayMonth(range.checkin)}. Elige la fecha de regreso`;
  }
  $('#tripRange').textContent = text;
}

function openTripDialog(trip = null) {
  tripDialogState = { editing: trip, range: { checkin: trip ? trip.start : '', checkout: trip ? trip.end : '' } };
  calendarMonth.delete('trip');
  $('#tripDialogTitle').textContent = trip ? 'Editar viaje' : 'Nuevo viaje';
  $('#tripName').value = trip ? trip.name : '';
  refreshTripDialog();
  $('#tripDialog').showModal();
}

$('#tripCal').addEventListener('click', (e) => {
  const { range } = tripDialogState;
  const day = e.target.closest('[data-day]');
  const nav = e.target.closest('[data-nav]');
  if (day) pickDay(range, day.dataset.day);
  else if (nav) calendarMonth.set('trip', shiftMonth(shownMonth(range, 'trip'), Number(nav.dataset.nav)));
  else return;
  refreshTripDialog();
});

$('#tripForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#tripName').value.trim();
  const { editing, range } = tripDialogState;
  if (!name) { $('#tripName').focus(); return; }
  if (!range.checkin || !range.checkout) {
    $('#tripRange').textContent = 'Elige también la fecha de regreso';
    return;
  }
  if (editing) {
    Object.assign(editing, { name, start: range.checkin, end: range.checkout });
    save();
    $('#tripDialog').close();
    renderList();
  } else {
    createTrip(name, range.checkin, range.checkout);
    $('#tripDialog').close();
    renderList();
  }
});

$('#cancelTrip').addEventListener('click', () => $('#tripDialog').close());

$('#addTrip').addEventListener('click', () => openTripDialog());

$('#sortBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sort]');
  if (!btn) return;
  listSort = btn.dataset.sort;
  renderList();
});

$('#tripList').addEventListener('click', (e) => {
  const card = e.target.closest('[data-trip]');
  if (!card) return;
  const trip = db.trips.find((t) => t.id === card.dataset.trip);
  if (!trip) return;
  if (e.target.closest('[data-edit]')) {
    openTripDialog(trip);
  } else if (e.target.closest('[data-delete]')) {
    if (!confirm(`¿Eliminar "${trip.name}" y todos sus datos? No se puede deshacer.`)) return;
    db.trips = db.trips.filter((t) => t !== trip);
    save();
    renderList();
  }
});

// ---------- Plantillas de visualización (una línea, sin inputs) ----------
const dotButton = (ok) => `<button type="button" class="dot-btn" data-toggle aria-label="${ok ? 'OK' : 'Pendiente'}"><span class="dot${ok ? ' ok' : ''}"></span></button>`;

const stayCalcText = (s) => {
  const nights = nightsBetween(s.checkin, s.checkout);
  return nights
    ? `${nights} ${nights === 1 ? 'noche' : 'noches'} · ${eur(num(s.total) / nights)} la noche`
    : '— noches';
};

// ---------- Piezas de la ventana de introducción ----------
const statePicker = (ok, [yes, no] = ['✓ OK', '● Pendiente']) => `
  <span class="field-label">Estado</span>
  <div class="seg">
    <button type="button" data-state="ok" class="${ok ? 'on ok' : ''}">${yes}</button>
    <button type="button" data-state="pend" class="${ok ? '' : 'on pend'}">${no}</button>
  </div>`;

// Botones que muestran todas las opciones a la vez; el valor elegido se guarda en el campo indicado
const chipPicker = (field, options, selected, layout) => `
  <div class="chips ${layout}" data-chips="${field}">
    ${options.map(([value, label]) => `<button type="button" data-val="${esc(value)}" class="${value === selected ? 'on' : ''}">${esc(label)}</button>`).join('')}
  </div>`;

// ---------- Secciones: cómo se ven (lista) y cómo se introducen (ventana) ----------
const SECTIONS = {
  transports: {
    title: ['Nuevo desplazamiento', 'Editar desplazamiento'],
    list: '#listDesp',
    empty: 'Sin desplazamientos todavía. Pulsa + para añadir uno.',
    items: () => current.transports,
    blank: () => ({ date: '', from: '', to: '', cost: 0, ok: false }),
    required: [],
    row: (t) => `
      <div class="row-view" data-id="${t.id}">
        <span class="when">${fmtDayMonth(t.date)}</span>
        <span class="what">${esc(t.from) || '—'} - ${esc(t.to) || '—'}</span>
        <span class="cost">${t.cost ? eur(t.cost) : ''}</span>
        ${dotButton(t.ok)}
      </div>`,
    form: (d) => `
      <label>Día<input type="date" data-f="date" value="${esc(d.date)}"></label>
      <div class="row2">
        <label>Origen<input type="text" data-f="from" placeholder="Barcelona" value="${esc(d.from)}"></label>
        <label>Destino<input type="text" data-f="to" placeholder="Milán" value="${esc(d.to)}"></label>
      </div>
      <label>Coste (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-f="cost" value="${d.cost || ''}"></label>
      ${statePicker(d.ok)}`,
  },

  stays: {
    title: ['Nuevo alojamiento', 'Editar alojamiento'],
    list: '#listAloj',
    empty: 'Sin alojamientos todavía. Pulsa + para añadir uno.',
    items: () => current.stays,
    blank: () => ({ checkin: '', checkout: '', location: '', total: 0, ok: false }),
    required: [],
    row: (s) => `
      <div class="row-view" data-id="${s.id}">
        <span class="when">${fmtDayMonth(s.checkin)} - ${fmtDayMonth(s.checkout)}</span>
        <span class="what">${esc(s.location) || '—'}</span>
        ${dotButton(s.ok)}
      </div>`,
    form: (d) => `
      <div id="calHost">${calendarHtml(d, d.id)}</div>
      <label>Ubicación<input type="text" data-f="location" placeholder="París" value="${esc(d.location)}"></label>
      <label>Total (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-f="total" value="${d.total || ''}"></label>
      <p class="muted" id="sheetCalc">${stayCalcText(d)}</p>
      ${statePicker(d.ok)}`,
  },

  todos: {
    title: ['Nueva tarea', 'Editar tarea'],
    list: '#listHacer',
    empty: 'Nada por hacer. Pulsa + para añadir algo.',
    items: () => current.todos,
    blank: () => ({ text: '', ok: false }),
    required: ['text'],
    row: (x) => `
      <div class="row-view wrap" data-id="${x.id}">
        ${dotButton(x.ok)}
        <span class="what">${esc(x.text)}</span>
      </div>`,
    form: (d) => `
      <label>Qué hay que hacer<input type="text" data-f="text" placeholder="Reservar hotel en Múnich" value="${esc(d.text)}"></label>
      ${statePicker(d.ok, ['✓ Hecho', '● Pendiente'])}`,
  },

  expenses: {
    title: ['Nuevo gasto', 'Editar gasto'],
    list: '#listVida',
    empty: 'Sin gastos todavía. Pulsa + para añadir uno.',
    items: () => [...current.expenses].sort((a, b) => a.day - b.day),
    blank: () => ({ day: Math.max(1, ...current.expenses.map((x) => num(x.day))), amount: 0, category: '', note: '' }),
    required: [],
    row: (x) => `
      <div class="row-view roomy" data-id="${x.id}">
        <span class="when">Día ${x.day}</span>
        <span class="what">${esc(x.category) || 'Sin categoría'}${x.note ? ` · ${esc(x.note)}` : ''}</span>
        <span class="cost">${eur(x.amount)}</span>
      </div>`,
    form: (d) => `
      <div class="row2">
        <label>Día del viaje<input type="number" inputmode="numeric" min="1" step="1" data-f="day" value="${d.day}"></label>
        <label>Importe (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-f="amount" value="${d.amount || ''}"></label>
      </div>
      <span class="field-label">Categoría</span>
      ${chipPicker('category', CATEGORIES.map((c) => [c, c]), d.category, 'chips-cat')}
      <label>Explicación<input type="text" data-f="note" placeholder="Bicicleta París" value="${esc(d.note)}"></label>`,
  },

  ideas: {
    title: ['Nueva idea', 'Editar idea'],
    list: '#listIdeas',
    empty: 'Sin ideas en esta categoría.',
    items: () => current.ideas.filter((i) => ideaFilter === 'todas' || i.type === ideaFilter),
    blank: () => ({ text: '', type: ideaFilter === 'todas' ? 'turismo' : ideaFilter }),
    required: ['text'],
    row: (x) => `
      <div class="row-view stacked" data-id="${x.id}">
        <span class="what">${esc(x.text)}</span>
        <span class="when">${IDEA_TYPES[x.type] || ''}</span>
      </div>`,
    form: (d) => `
      <label>Idea<input type="text" data-f="text" placeholder="Museo de las Tortugas" value="${esc(d.text)}"></label>
      <span class="field-label">Tipo</span>
      ${chipPicker('type', Object.entries(IDEA_TYPES), d.type, 'chips-row')}`,
  },
};

function renderSection(key) {
  const cfg = SECTIONS[key];
  const items = cfg.items();
  $(cfg.list).innerHTML = items.length
    ? items.map(cfg.row).join('')
    : `<p class="muted">${cfg.empty}</p>`;
}

// ---------- Totales (se recalculan al cambiar cualquier dato) ----------
function updateTotals() {
  const sum = (list, field) => list.reduce((acc, x) => acc + num(x[field]), 0);
  const desp = sum(current.transports, 'cost');
  const aloj = sum(current.stays, 'total');
  const vida = sum(current.expenses, 'amount');
  const dayCount = tripDays(current) || Math.max(1, ...current.expenses.map((x) => num(x.day)));

  $('#sumDesp').textContent = eur(desp);
  $('#sumAloj').textContent = eur(aloj);
  $('#sumVida').textContent = eur(vida);
  $('#mediaVida').textContent = `${eur(vida / dayCount)} / día`;
  $('#resDesp').textContent = eur(desp);
  $('#resAloj').textContent = eur(aloj);
  $('#resVida').textContent = eur(vida);
  $('#resTotal').textContent = eur(desp + aloj + vida);
}

// ---------- Pestañas y cabecera del viaje ----------
// "Juntos" muestra Moverse, Dormir y Hacer a la vez; cualquier pestaña vuelve a un solo apartado
const GROUP_TABS = ['desp', 'aloj', 'hacer'];
let activeTab = 'desp';
let grouped = false;

function paintPanels() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', grouped ? GROUP_TABS.includes(b.dataset.tab) : b.dataset.tab === activeTab));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = grouped ? !GROUP_TABS.includes(p.dataset.panel) : p.dataset.panel !== activeTab; });
  $('#juntosBtn').classList.toggle('on', grouped);
  $('#juntosBtn').setAttribute('aria-pressed', String(grouped));
}

function showTab(tab) {
  activeTab = tab;
  grouped = false;
  paintPanels();
  window.scrollTo(0, 0);
}

$('#juntosBtn').addEventListener('click', () => {
  grouped = !grouped;
  paintPanels();
  window.scrollTo(0, 0);
});

function paintFilters() {
  document.querySelectorAll('#ideaFilters button').forEach((b) => b.classList.toggle('on', b.dataset.filter === ideaFilter));
}

function paintTripHeader() {
  $('#tripTitle').textContent = current.name || 'Sin nombre';
  const days = tripDays(current);
  $('#tripDates').textContent = `${fmtDayMonth(current.start)} - ${fmtDayMonth(current.end)}${days ? ` · ${days} días` : ''}`;
}

// ---------- Apertura de un viaje y pantallas ----------
function openTrip(trip) {
  current = trip;
  calendarMonth.clear();
  ideaFilter = 'todas';
  $('#listView').hidden = true;
  $('#tripView').hidden = false;
  paintTripHeader();
  $('#tripNotes').value = trip.notes;
  paintFilters();
  Object.keys(SECTIONS).forEach(renderSection);
  updateTotals();
  showTab('desp');
}

function showList() {
  current = null;
  $('#tripView').hidden = true;
  $('#listView').hidden = false;
  renderList();
}

function route() {
  const match = location.hash.match(/^#\/trip\/([\w-]+)$/);
  const trip = match && db.trips.find((t) => t.id === match[1]);
  if (trip) return openTrip(trip);
  if (match) { location.hash = '#/'; return; }
  showList();
}

// ---------- Ventana de elemento (alta y edición) ----------
function openSheet(key, item, isNew) {
  const cfg = SECTIONS[key];
  sheet = { key, isNew, draft: { ...item } };
  $('#sheetTitle').textContent = cfg.title[isNew ? 0 : 1];
  $('#sheetBody').innerHTML = cfg.form(sheet.draft);
  $('#sheetDelete').hidden = isNew;
  $('#sheetDialog').showModal();
}

function closeSheet() {
  $('#sheetDialog').close();
}

function refreshCalendar() {
  $('#calHost').innerHTML = calendarHtml(sheet.draft, sheet.draft.id);
  $('#sheetCalc').textContent = stayCalcText(sheet.draft);
}

// Los campos se guardan en el borrador al escribir; el guardado real es con "Guardar"
function setDraft(el) {
  const field = el.dataset.f;
  if (!field || !sheet) return;
  sheet.draft[field] = el.type === 'number' ? num(el.value) : el.value;
  if (sheet.key === 'stays') $('#sheetCalc').textContent = stayCalcText(sheet.draft);
}

$('#sheetBody').addEventListener('input', (e) => setDraft(e.target));
$('#sheetBody').addEventListener('change', (e) => setDraft(e.target));

$('#sheetBody').addEventListener('click', (e) => {
  if (!sheet) return;
  const day = e.target.closest('[data-day]');
  const nav = e.target.closest('[data-nav]');
  const state = e.target.closest('[data-state]');
  const chip = e.target.closest('[data-val]');
  if (day) {
    pickDay(sheet.draft, day.dataset.day);
    refreshCalendar();
  } else if (nav) {
    calendarMonth.set(sheet.draft.id, shiftMonth(shownMonth(sheet.draft, sheet.draft.id), Number(nav.dataset.nav)));
    refreshCalendar();
  } else if (state) {
    sheet.draft.ok = state.dataset.state === 'ok';
    state.parentElement.querySelectorAll('button').forEach((b) => {
      b.className = b === state ? (sheet.draft.ok ? 'on ok' : 'on pend') : '';
    });
  } else if (chip) {
    const group = chip.closest('[data-chips]');
    sheet.draft[group.dataset.chips] = chip.dataset.val;
    group.querySelectorAll('[data-val]').forEach((b) => b.classList.toggle('on', b === chip));
  }
});

$('#sheetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!sheet) return;
  const { key, isNew, draft } = sheet;
  const missing = SECTIONS[key].required.find((f) => !String(draft[f] ?? '').trim());
  if (missing) {
    $(`#sheetBody [data-f="${missing}"]`).focus();
    return;
  }
  const list = current[key];
  const index = list.findIndex((x) => x.id === draft.id);
  if (index < 0) list.push(draft);
  else list[index] = draft;
  save();
  closeSheet();
  renderSection(key);
  updateTotals();
});

$('#sheetDelete').addEventListener('click', () => {
  if (!sheet || !confirm('¿Eliminar este elemento?')) return;
  const key = sheet.key;
  current[key] = current[key].filter((x) => x.id !== sheet.draft.id);
  save();
  closeSheet();
  renderSection(key);
  updateTotals();
});

$('#sheetCancel').addEventListener('click', closeSheet);
$('#sheetDialog').addEventListener('close', () => { sheet = null; });

// ---------- Eventos de cada apartado ----------
// Tocar una fila abre su ventana; tocar el círculo cambia el estado sin abrirla.
Object.entries(SECTIONS).forEach(([key, cfg]) => {
  $(cfg.list).addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const item = current[key].find((x) => x.id === row.dataset.id);
    if (!item) return;
    if (e.target.closest('[data-toggle]')) {
      item.ok = !item.ok;
      save();
      renderSection(key);
      updateTotals();
      return;
    }
    openSheet(key, item, false);
  });
});

document.querySelectorAll('[data-new]').forEach((btn) => btn.addEventListener('click', () => {
  const key = btn.dataset.new;
  openSheet(key, { id: uid(), ...SECTIONS[key].blank() }, true);
}));

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) showTab(btn.dataset.tab);
});

$('#ideaFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  ideaFilter = btn.dataset.filter;
  paintFilters();
  renderSection('ideas');
});

$('#tripNotes').addEventListener('input', (e) => {
  current.notes = e.target.value;
  save();
});

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
