'use strict';

// Datos: todo se guarda en este dispositivo (localStorage), así funciona sin conexión.
const STORAGE_KEY = 'miruta-v1';
const CATEGORIES = [
  'Atracción turística', 'Compras', 'Lavandería', 'Parking', 'Restaurante',
  'Supermercado', 'Telefonía', 'Transporte', 'Visa', 'Otros',
].sort(new Intl.Collator('es').compare);
const IDEA_TYPES = { turismo: 'Turismo', restauracion: 'Restauración' };
const eurFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

let db = loadDb();
let current = null; // viaje abierto
let ideaFilter = 'todas';

// ---------- Utilidades ----------
const $ = (selector) => document.querySelector(selector);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => eurFormat.format(n || 0);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const shortDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
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

function createTrip(name, start, end) {
  const trip = { id: uid(), name, start, end, transports: [], stays: [], todos: [], expenses: [], ideas: [], notes: '' };
  db.trips.push(trip);
  save();
  return trip;
}

// ---------- Pantalla 1: listado de viajes ----------
function renderList() {
  const trips = [...db.trips].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name, 'es'));
  $('#tripList').innerHTML = trips.length
    ? trips.map((t) => {
      const days = tripDays(t);
      return `<a class="trip-card" href="#/trip/${t.id}">
        <strong>${esc(t.name)}</strong>
        <span class="muted">${shortDate(t.start)} → ${shortDate(t.end)}${days ? ` · ${days} días` : ''}</span>
      </a>`;
    }).join('')
    : '<p class="empty">Aún no tienes viajes. Pulsa + para crear el primero.</p>';
}

// ---------- Plantillas de cada fila ----------
const statusButton = (ok) => `<button type="button" class="status ${ok ? 'ok' : 'pend'}" data-toggle>${ok ? '✓ OK' : '● Pendiente'}</button>`;
const paintStatus = (btn, ok) => { btn.className = `status ${ok ? 'ok' : 'pend'}`; btn.textContent = ok ? '✓ OK' : '● Pendiente'; };
const categoryOptions = (selected) => [
  '<option value="">Categoría</option>',
  ...CATEGORIES.map((c) => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${esc(c)}</option>`),
].join('');
const ideaTypeOptions = (selected) => Object.entries(IDEA_TYPES)
  .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');

const rows = {
  transports: (t) => `
    <div class="item" data-id="${t.id}">
      <div class="line">
        <input class="date" type="date" data-field="date" value="${esc(t.date)}" aria-label="Día">
        <input type="text" data-field="from" placeholder="Desde" value="${esc(t.from)}" aria-label="Origen">
        <span class="arrow">→</span>
        <input type="text" data-field="to" placeholder="Hasta" value="${esc(t.to)}" aria-label="Destino">
      </div>
      <div class="line">
        <input class="num" type="number" inputmode="decimal" min="0" step="0.01" data-field="cost" placeholder="Coste €" value="${t.cost || ''}" aria-label="Coste en euros">
        <span class="calc"></span>
        ${statusButton(t.ok)}
        <button type="button" class="del" data-del aria-label="Eliminar">✕</button>
      </div>
    </div>`,

  stays: (s) => `
    <div class="item" data-id="${s.id}">
      <div class="line">
        <input class="date" type="date" data-field="checkin" value="${esc(s.checkin)}" aria-label="Entrada">
        <span class="arrow">→</span>
        <input class="date" type="date" data-field="checkout" value="${esc(s.checkout)}" aria-label="Salida">
      </div>
      <input type="text" data-field="location" placeholder="Ubicación (ej. París)" value="${esc(s.location)}" aria-label="Ubicación">
      <div class="line">
        <input class="num" type="number" inputmode="decimal" min="0" step="0.01" data-field="total" placeholder="Total €" value="${s.total || ''}" aria-label="Total en euros">
        <span class="calc"></span>
        ${statusButton(s.ok)}
        <button type="button" class="del" data-del aria-label="Eliminar">✕</button>
      </div>
    </div>`,

  todos: (x) => `
    <div class="item" data-id="${x.id}">
      <div class="line">
        <input type="text" data-field="text" placeholder="Acción (ej. Reservar hotel en Múnich)" value="${esc(x.text)}" aria-label="Pendiente">
        <button type="button" class="del" data-del aria-label="Eliminar">✕</button>
      </div>
    </div>`,

  expenses: (x) => `
    <div class="item" data-id="${x.id}">
      <div class="line">
        <input class="day" type="number" inputmode="numeric" min="1" step="1" data-field="day" value="${x.day}" aria-label="Día del viaje">
        <input class="num" type="number" inputmode="decimal" min="0" step="0.01" data-field="amount" placeholder="€" value="${x.amount || ''}" aria-label="Importe en euros">
        <select data-field="category" aria-label="Categoría">${categoryOptions(x.category)}</select>
        <button type="button" class="del" data-del aria-label="Eliminar">✕</button>
      </div>
      <input type="text" data-field="note" placeholder="Explicación (ej. bicicleta París)" value="${esc(x.note)}" aria-label="Explicación">
    </div>`,

  ideas: (x) => `
    <div class="item" data-id="${x.id}">
      <div class="line">
        <input type="text" data-field="text" placeholder="Idea (ej. Museo de las Tortugas)" value="${esc(x.text)}" aria-label="Idea">
        <select class="type" data-field="type" aria-label="Tipo">${ideaTypeOptions(x.type)}</select>
        <button type="button" class="del" data-del aria-label="Eliminar">✕</button>
      </div>
    </div>`,
};

function paint(selector, items, rowFn, emptyText) {
  $(selector).innerHTML = items.length
    ? items.map(rowFn).join('')
    : `<p class="muted">${emptyText}</p>`;
}

const renderers = {
  transports: () => paint('#listDesp', current.transports, rows.transports, 'Sin desplazamientos todavía.'),
  stays: () => paint('#listAloj', current.stays, rows.stays, 'Sin alojamientos todavía.'),
  todos: () => paint('#listPend', current.todos, rows.todos, 'Nada pendiente.'),
  expenses: () => paint('#listVida', [...current.expenses].sort((a, b) => a.day - b.day), rows.expenses, 'Sin gastos todavía.'),
  ideas: () => paint('#listIdeas', current.ideas.filter((i) => ideaFilter === 'todas' || i.type === ideaFilter), rows.ideas, 'Sin ideas en esta categoría.'),
};

// ---------- Totales (se recalculan al cambiar cualquier campo) ----------
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

  const diff = daysBetween(current.start, current.end);
  $('#fHint').textContent = diff === null ? 'Sin fechas' : diff < 0 ? '⚠ Regreso antes de inicio' : `${diff + 1} días · ${diff} noches`;

  current.stays.forEach((s) => {
    const row = $(`#listAloj [data-id="${s.id}"]`);
    if (!row) return;
    const nights = nightsBetween(s.checkin, s.checkout);
    row.querySelector('.calc').textContent = nights
      ? `${nights} ${nights === 1 ? 'noche' : 'noches'} · ${eur(num(s.total) / nights)} la noche`
      : '— noches';
  });
}

// ---------- Apertura de un viaje ----------
function paintFilters() {
  document.querySelectorAll('#ideaFilters button').forEach((b) => b.classList.toggle('on', b.dataset.filter === ideaFilter));
}

function openTrip(trip) {
  current = trip;
  $('#listView').hidden = true;
  $('#tripView').hidden = false;
  $('#tripTitle').textContent = trip.name || 'Sin nombre';
  $('#fName').value = trip.name;
  $('#fStart').value = trip.start;
  $('#fEnd').value = trip.end;
  $('#tripNotes').value = trip.notes;
  ideaFilter = 'todas';
  paintFilters();
  Object.values(renderers).forEach((render) => render());
  updateTotals();
  window.scrollTo(0, 0);
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

// ---------- Edición de listas ----------
function findItem(target, key) {
  const row = target.closest('[data-id]');
  return row ? current[key].find((x) => x.id === row.dataset.id) : undefined;
}

// Los cambios se guardan al salir del campo; no se redibuja la lista para no perder el foco.
function bindList(selector, key) {
  const el = $(selector);
  el.addEventListener('change', (e) => {
    const field = e.target.dataset.field;
    const item = findItem(e.target, key);
    if (!field || !item) return;
    item[field] = e.target.type === 'number' ? num(e.target.value) : e.target.value;
    save();
    if (key === 'ideas' && field === 'type' && ideaFilter !== 'todas') renderers.ideas();
    updateTotals();
  });
  el.addEventListener('click', (e) => {
    const item = findItem(e.target, key);
    if (!item) return;
    if (e.target.closest('[data-del]')) {
      current[key] = current[key].filter((x) => x !== item);
      save();
      renderers[key]();
      updateTotals();
    }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      item.ok = !item.ok;
      paintStatus(toggle, item.ok);
      save();
      updateTotals();
    }
  });
}

function newItem(key) {
  const lastDay = Math.max(1, ...current.expenses.map((x) => num(x.day)));
  const blank = {
    transports: { date: '', from: '', to: '', cost: 0, ok: false },
    stays: { checkin: '', checkout: '', location: '', total: 0, ok: false },
    todos: { text: '' },
    expenses: { day: lastDay, amount: 0, category: '', note: '' },
    ideas: { text: '', type: ideaFilter === 'todas' ? 'turismo' : ideaFilter },
  };
  return { id: uid(), ...blank[key] };
}

// ---------- Eventos ----------
$('#addTrip').addEventListener('click', () => {
  $('#newTripForm').reset();
  $('#newTripDialog').showModal();
});

$('#cancelTrip').addEventListener('click', () => $('#newTripDialog').close());

$('#newTripForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#newTripName').value.trim();
  if (!name) { $('#newTripName').focus(); return; }
  const trip = createTrip(name, $('#newTripStart').value, $('#newTripEnd').value);
  $('#newTripDialog').close();
  location.hash = `#/trip/${trip.id}`;
});

$('#fName').addEventListener('input', (e) => {
  current.name = e.target.value;
  $('#tripTitle').textContent = e.target.value || 'Sin nombre';
  save();
});

$('#fStart').addEventListener('change', (e) => {
  current.start = e.target.value;
  save();
  updateTotals();
});

$('#fEnd').addEventListener('change', (e) => {
  current.end = e.target.value;
  save();
  updateTotals();
});

$('#tripNotes').addEventListener('input', (e) => {
  current.notes = e.target.value;
  save();
});

bindList('#listDesp', 'transports');
bindList('#listAloj', 'stays');
bindList('#listPend', 'todos');
bindList('#listVida', 'expenses');
bindList('#listIdeas', 'ideas');

document.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
  const key = btn.dataset.add;
  const item = newItem(key);
  current[key].push(item);
  save();
  renderers[key]();
  updateTotals();
  $(`[data-id="${item.id}"] [data-field]`)?.focus();
}));

$('#ideaFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  ideaFilter = btn.dataset.filter;
  paintFilters();
  renderers.ideas();
});

$('#deleteTrip').addEventListener('click', () => {
  if (!confirm(`¿Eliminar "${current.name}" y todos sus datos? No se puede deshacer.`)) return;
  db.trips = db.trips.filter((t) => t !== current);
  save();
  location.hash = '#/';
});

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
