// js/admin-jobs.js — Vista "Búsqueda de trabajo" de Dazenty OS
// ==========================================================
// Muestra lo que guardan los flujos de n8n del Job Agent (tablas ja_* en Supabase):
// perfil analizado, métricas y pipeline de candidaturas (Kanban con arrastrar y soltar).
// Usa los helpers globales de admin.html: adminPass, esc(), showToast().
// ==========================================================

const JOB_PROFILE_FORM_URL = 'https://n8n.dazenty.com/form/job-agent-perfil';

const JOB_COLUMNS = [
  { key: 'por_aplicar', label: 'Por aplicar (tú)', statuses: ['nueva', 'preparada', 'requiere_accion'], drop: 'preparada', color: '#d97762' },
  { key: 'pendiente_ok', label: 'Pendiente OK', statuses: ['pendiente_ok'], drop: 'pendiente_ok', color: '#eab308' },
  { key: 'aplicada', label: 'Aplicada', statuses: ['aplicada'], drop: 'aplicada', color: '#3b82f6' },
  { key: 'vista', label: 'Vista', statuses: ['vista'], drop: 'vista', color: '#8b5cf6' },
  { key: 'prueba', label: 'Prueba técnica', statuses: ['prueba'], drop: 'prueba', color: '#06b6d4' },
  { key: 'entrevista', label: 'Entrevista', statuses: ['entrevista'], drop: 'entrevista', color: '#22c55e' },
  { key: 'oferta', label: 'Oferta', statuses: ['oferta'], drop: 'oferta', color: '#10b981' },
  { key: 'cerrada', label: 'Rechazada / Descartada', statuses: ['rechazada', 'descartada'], drop: 'descartada', color: '#6b7280' },
];

const JOB_STATUS_LABELS = {
  nueva: 'Nueva', preparada: 'Preparada', requiere_accion: 'Requiere acción', pendiente_ok: 'Pendiente OK',
  aplicada: 'Aplicada', vista: 'Vista', prueba: 'Prueba técnica', entrevista: 'Entrevista',
  oferta: 'Oferta', rechazada: 'Rechazada', descartada: 'Descartada',
};

const jobState = { profile: null, applications: [], search: '', portal: '', loading: false };

async function loadJobSearch() {
  if (jobState.loading) return;
  jobState.loading = true;
  const board = document.getElementById('jobsBoard');
  if (board && !jobState.applications.length) board.innerHTML = '<p class="text-gray-600 text-sm">Cargando…</p>';
  try {
    const r = await fetch('/api/job-search', { headers: { 'x-admin-password': adminPass } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
    jobState.profile = data.profile;
    jobState.applications = data.applications || [];
    renderJobSearch();
  } catch (err) {
    console.error('[jobs]', err);
    if (board) board.innerHTML = '<p class="text-red-400 text-sm">No se pudo cargar: ' + esc(err.message) + '</p>';
  } finally {
    jobState.loading = false;
  }
}

function renderJobSearch() {
  renderJobProfile();
  renderJobKpis();
  renderJobPortalFilter();
  renderJobsBoard();
}

// ─── Perfil ─────────────────────────────────────────────────────────────────
function renderJobProfile() {
  const el = document.getElementById('jobsProfile');
  if (!el) return;
  const p = jobState.profile && jobState.profile.analysis;
  if (!p) {
    el.innerHTML =
      '<div class="bg-brand-gray border border-white/5 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">' +
        '<div><p class="font-display font-semibold">Aún no hay perfil analizado</p>' +
        '<p class="text-gray-500 text-sm mt-1">Sube tu CV en el formulario del flujo WF1 de n8n y Claude analizará tu experiencia.</p></div>' +
        '<a href="' + JOB_PROFILE_FORM_URL + '" target="_blank" rel="noopener" class="shrink-0 bg-brand-blue text-black font-display font-semibold text-sm rounded-xl px-4 py-2.5 hover:opacity-90 transition-opacity">Abrir formulario de perfil</a>' +
      '</div>';
    return;
  }
  const chips = (arr) => (arr || []).map((k) => '<span class="text-[11px] px-2 py-1 rounded-lg bg-white/5 text-gray-300">' + esc(k) + '</span>').join(' ');
  const roles = (p.puestos_objetivo || []).slice(0, 6).map((r) =>
    '<li class="flex justify-between gap-3"><span class="text-gray-300">' + esc(r.titulo_es) + '</span><span class="text-gray-500">' + esc(String(r.encaje)) + '</span></li>').join('');
  const faltan = (p.datos_faltantes || []);
  const updated = jobState.profile.updated_at ? new Date(jobState.profile.updated_at).toLocaleDateString('es-ES') : '';
  el.innerHTML =
    '<details class="bg-brand-gray border border-white/5 rounded-2xl p-5 group">' +
      '<summary class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-3">' +
        '<div><p class="text-xs font-semibold text-brand-blue uppercase tracking-widest mb-1">Tu perfil</p>' +
        '<p class="font-display font-semibold">' + esc(cap(p.seniority)) + ' · ' + esc(String(p.anos_experiencia_total)) + ' años · ' +
          esc((p.puestos_objetivo || [])[0] ? p.puestos_objetivo[0].titulo_es : '') + '</p></div>' +
        '<div class="flex items-center gap-3 text-xs text-gray-500">' +
          (faltan.length ? '<span class="px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400">' + faltan.length + ' datos por completar</span>' : '') +
          '<span>Actualizado ' + esc(updated) + '</span><span class="group-open:rotate-180 transition-transform">▾</span></div>' +
      '</summary>' +
      '<div class="grid md:grid-cols-3 gap-5 mt-5 text-sm">' +
        '<div><p class="text-gray-500 text-xs uppercase tracking-widest mb-2">Puestos objetivo</p><ul class="space-y-1">' + roles + '</ul></div>' +
        '<div><p class="text-gray-500 text-xs uppercase tracking-widest mb-2">Búsqueda ES / EN</p>' +
          '<div class="flex flex-wrap gap-1.5 mb-2">' + chips((p.keywords_busqueda || {}).es) + '</div>' +
          '<div class="flex flex-wrap gap-1.5">' + chips((p.keywords_busqueda || {}).en) + '</div></div>' +
        '<div><p class="text-gray-500 text-xs uppercase tracking-widest mb-2">Te falta completar</p>' +
          (faltan.length ? '<ul class="space-y-1 text-gray-300 list-disc pl-4">' + faltan.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '<p class="text-gray-500">Nada 🎉</p>') +
          '<a href="' + JOB_PROFILE_FORM_URL + '" target="_blank" rel="noopener" class="inline-block mt-3 text-xs text-brand-blue hover:text-white">Actualizar perfil →</a></div>' +
      '</div>' +
    '</details>';
}

// ─── Métricas ───────────────────────────────────────────────────────────────
function renderJobKpis() {
  const el = document.getElementById('jobsKpis');
  if (!el) return;
  const apps = jobState.applications;
  const weekAgo = Date.now() - 7 * 86400000;
  const count = (sts) => apps.filter((a) => sts.includes(a.status)).length;
  const applied = apps.filter((a) => a.applied_at);
  const responded = applied.filter((a) => ['vista', 'prueba', 'entrevista', 'oferta', 'rechazada'].includes(a.status));
  const kpis = [
    { label: 'Por aplicar (tú)', value: count(['nueva', 'preparada', 'requiere_accion']) },
    { label: 'Pendientes de tu OK', value: count(['pendiente_ok']) },
    { label: 'Aplicadas esta semana', value: applied.filter((a) => new Date(a.applied_at).getTime() >= weekAgo).length },
    { label: 'Respuestas', value: responded.length },
    { label: 'Entrevistas', value: count(['entrevista']) },
    { label: 'Tasa de respuesta', value: applied.length ? Math.round((responded.length / applied.length) * 100) + '%' : '—' },
  ];
  el.innerHTML = kpis.map((k) =>
    '<div class="bg-brand-gray border border-white/5 rounded-2xl p-4">' +
      '<p class="text-gray-500 text-xs">' + esc(k.label) + '</p>' +
      '<p class="font-display font-bold text-2xl mt-1">' + esc(String(k.value)) + '</p>' +
    '</div>').join('');
}

// ─── Filtros ────────────────────────────────────────────────────────────────
function renderJobPortalFilter() {
  const sel = document.getElementById('jobsPortalFilter');
  if (!sel) return;
  const portals = [...new Set(jobState.applications.map((a) => a.job && a.job.portal).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todos los portales</option>' +
    portals.map((p) => '<option value="' + esc(p) + '"' + (p === jobState.portal ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
}

function handleJobSearch(value) {
  jobState.search = String(value || '').toLowerCase().trim();
  renderJobsBoard();
}

function handleJobPortal(value) {
  jobState.portal = value || '';
  renderJobsBoard();
}

function filteredJobApps() {
  return jobState.applications.filter((a) => {
    const j = a.job || {};
    if (jobState.portal && j.portal !== jobState.portal) return false;
    if (!jobState.search) return true;
    return [j.title, j.company, j.location, j.portal].join(' ').toLowerCase().includes(jobState.search);
  });
}

// ─── Kanban ─────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score == null) return 'bg-white/5 text-gray-500';
  if (score >= 80) return 'bg-green-500/10 text-green-400';
  if (score >= 65) return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-red-500/10 text-red-400';
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function jobCardHtml(a) {
  const j = a.job || {};
  const d = daysSince(a.applied_at);
  return '<div class="job-card bg-brand-card border border-white/5 rounded-xl p-3 cursor-pointer hover:border-brand-blue/40 transition-colors" draggable="true" data-job-app="' + esc(a.id) + '">' +
    '<div class="flex items-start justify-between gap-2">' +
      '<p class="text-sm font-medium leading-snug">' + esc(j.title || 'Oferta') + '</p>' +
      '<span class="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ' + scoreColor(a.score) + '">' + (a.score == null ? '—' : esc(String(a.score))) + '</span>' +
    '</div>' +
    '<p class="text-xs text-gray-400 mt-1">' + esc(j.company || '') + '</p>' +
    '<p class="text-[11px] text-gray-500 mt-1">' + esc([j.location, j.remote_type].filter(Boolean).join(' · ')) + '</p>' +
    '<div class="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] text-gray-500">' +
      (j.portal ? '<span class="px-1.5 py-0.5 rounded bg-white/5">' + esc(j.portal) + '</span>' : '') +
      (j.salary ? '<span class="px-1.5 py-0.5 rounded bg-white/5">' + esc(j.salary) + '</span>' : '') +
      (a.status === 'requiere_accion' ? '<span class="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">Requiere acción</span>' : '') +
      (d != null ? '<span>hace ' + d + ' d</span>' : '') +
    '</div>' +
  '</div>';
}

function renderJobsBoard() {
  const board = document.getElementById('jobsBoard');
  if (!board) return;
  const apps = filteredJobApps();
  const label = document.getElementById('jobsCountLabel');
  if (label) label.textContent = jobState.applications.length
    ? apps.length + ' de ' + jobState.applications.length + ' candidaturas'
    : '';

  if (!jobState.applications.length) {
    board.innerHTML = '<div class="bg-brand-gray border border-white/5 rounded-2xl p-8 text-center text-gray-500 text-sm col-span-full">' +
      'Todavía no hay ofertas. Aparecerán aquí cuando el flujo de búsqueda (WF2) empiece a encontrarlas.</div>';
    return;
  }

  board.innerHTML = JOB_COLUMNS.map((col) => {
    const items = apps.filter((a) => col.statuses.includes(a.status));
    return '<div class="job-col bg-brand-gray/60 border border-white/5 rounded-2xl p-3 min-h-[160px]" data-job-col="' + col.key + '">' +
      '<div class="flex items-center justify-between mb-3 px-1">' +
        '<p class="text-xs font-semibold flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:' + col.color + '"></span>' + esc(col.label) + '</p>' +
        '<span class="text-[11px] text-gray-500">' + items.length + '</span>' +
      '</div>' +
      '<div class="space-y-2">' + items.map(jobCardHtml).join('') + '</div>' +
    '</div>';
  }).join('');
}

async function updateJobApplication(id, body, okMsg) {
  try {
    const r = await fetch('/api/job-search?id=' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPass },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
    const i = jobState.applications.findIndex((a) => a.id === id);
    if (i >= 0) jobState.applications[i] = { ...jobState.applications[i], ...data, job: jobState.applications[i].job };
    renderJobKpis();
    renderJobsBoard();
    if (okMsg) showToast(okMsg);
    return true;
  } catch (err) {
    showToast('No se pudo guardar: ' + err.message, 'error');
    return false;
  }
}

// Arrastrar y soltar entre columnas (delegado en el tablero)
document.addEventListener('dragstart', (e) => {
  const card = e.target.closest && e.target.closest('[data-job-app]');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.jobApp);
  e.dataTransfer.effectAllowed = 'move';
  card.style.opacity = '0.5';
});
document.addEventListener('dragend', (e) => {
  const card = e.target.closest && e.target.closest('[data-job-app]');
  if (card) card.style.opacity = '';
  document.querySelectorAll('[data-job-col]').forEach((c) => c.classList.remove('ring-1', 'ring-brand-blue/50'));
});
document.addEventListener('dragover', (e) => {
  const col = e.target.closest && e.target.closest('[data-job-col]');
  if (!col) return;
  e.preventDefault();
  col.classList.add('ring-1', 'ring-brand-blue/50');
});
document.addEventListener('dragleave', (e) => {
  const col = e.target.closest && e.target.closest('[data-job-col]');
  if (col && !col.contains(e.relatedTarget)) col.classList.remove('ring-1', 'ring-brand-blue/50');
});
document.addEventListener('drop', (e) => {
  const col = e.target.closest && e.target.closest('[data-job-col]');
  if (!col) return;
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const target = JOB_COLUMNS.find((c) => c.key === col.dataset.jobCol);
  const app = jobState.applications.find((a) => a.id === id);
  if (!target || !app || target.statuses.includes(app.status)) return;
  updateJobApplication(id, { status: target.drop }, 'Movida a "' + target.label + '"');
});
document.addEventListener('click', (e) => {
  const card = e.target.closest && e.target.closest('[data-job-app]');
  if (card) openJobDetail(card.dataset.jobApp);
});

// ─── Ficha de la oferta ─────────────────────────────────────────────────────
function ensureJobModal() {
  let ov = document.getElementById('jobDetailOverlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'jobDetailOverlay';
  ov.className = 'fixed inset-0 bg-black/75 backdrop-blur-sm z-40 hidden items-start justify-center overflow-y-auto p-4';
  ov.innerHTML = '<div id="jobDetailBox" class="bg-brand-gray border border-white/10 rounded-2xl w-full max-w-2xl my-10 p-6"></div>';
  ov.addEventListener('click', (e) => { if (e.target === ov) closeJobDetail(); });
  document.body.appendChild(ov);
  return ov;
}

function closeJobDetail() {
  const ov = document.getElementById('jobDetailOverlay');
  if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); }
}

function listHtml(title, items, cls) {
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  if (!arr.length) return '';
  return '<div><p class="text-gray-500 text-xs uppercase tracking-widest mb-2">' + esc(title) + '</p>' +
    '<ul class="space-y-1 text-sm list-disc pl-4 ' + cls + '">' +
    arr.map((x) => '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>').join('') + '</ul></div>';
}

function openJobDetail(id) {
  const a = jobState.applications.find((x) => x.id === id);
  if (!a) return;
  const j = a.job || {};
  const ov = ensureJobModal();
  const box = document.getElementById('jobDetailBox');
  const statusOptions = Object.keys(JOB_STATUS_LABELS).map((s) =>
    '<option value="' + s + '"' + (s === a.status ? ' selected' : '') + '>' + JOB_STATUS_LABELS[s] + '</option>').join('');
  box.innerHTML =
    '<div class="flex items-start justify-between gap-4 mb-5">' +
      '<div><p class="text-xs text-gray-500 mb-1">' + esc([j.portal, j.location, j.remote_type].filter(Boolean).join(' · ')) + '</p>' +
      '<h2 class="font-display font-bold text-xl">' + esc(j.title || 'Oferta') + '</h2>' +
      '<p class="text-gray-400 text-sm mt-0.5">' + esc(j.company || '') + (j.salary ? ' · ' + esc(j.salary) : '') + '</p></div>' +
      '<div class="flex items-center gap-2"><span class="text-sm font-semibold px-2 py-1 rounded-lg ' + scoreColor(a.score) + '">' + (a.score == null ? '—' : esc(String(a.score))) + '</span>' +
      '<button type="button" data-job-close class="text-gray-500 hover:text-white p-1" aria-label="Cerrar">✕</button></div>' +
    '</div>' +
    '<div class="flex flex-wrap gap-2 mb-6">' +
      (j.url ? '<a href="' + esc(j.url) + '" target="_blank" rel="noopener" class="bg-brand-blue text-black font-display font-semibold text-sm rounded-xl px-4 py-2.5 hover:opacity-90">Abrir oferta para aplicar</a>' : '') +
      (a.applied_at ? '' : '<button type="button" data-job-sent class="border border-white/10 text-sm rounded-xl px-4 py-2.5 hover:border-white/20 text-gray-300">Ya la he enviado</button>') +
      (a.cover_letter ? '<button type="button" data-job-copy class="border border-white/10 text-sm rounded-xl px-4 py-2.5 hover:border-white/20 text-gray-300">Copiar carta</button>' : '') +
      '<select data-job-status class="!w-auto text-sm">' + statusOptions + '</select>' +
    '</div>' +
    '<div class="grid sm:grid-cols-2 gap-5 mb-6">' +
      listHtml('Por qué encaja', a.reasons, 'text-gray-300') +
      listHtml('Te falta', a.missing_requirements, 'text-yellow-300/90') +
      listHtml('Red flags', a.red_flags, 'text-red-300/90') +
    '</div>' +
    '<p class="text-gray-500 text-xs uppercase tracking-widest mb-2">Carta de presentación</p>' +
    '<textarea data-job-letter rows="8" class="mb-4" placeholder="La carta aparecerá aquí cuando el flujo WF4 la prepare.">' + esc(a.cover_letter || '') + '</textarea>' +
    '<p class="text-gray-500 text-xs uppercase tracking-widest mb-2">Notas</p>' +
    '<textarea data-job-notes rows="3" class="mb-4" placeholder="Tus notas sobre esta candidatura">' + esc(a.notes || '') + '</textarea>' +
    '<div class="flex items-center justify-between gap-3">' +
      '<p class="text-xs text-gray-600">' + (a.applied_at ? 'Aplicada el ' + new Date(a.applied_at).toLocaleDateString('es-ES') : 'Encontrada el ' + new Date(a.created_at).toLocaleDateString('es-ES')) + '</p>' +
      '<button type="button" data-job-save class="bg-brand-blue text-black font-display font-semibold text-sm rounded-xl px-4 py-2.5 hover:opacity-90">Guardar</button>' +
    '</div>';

  box.querySelector('[data-job-close]').onclick = closeJobDetail;
  const sent = box.querySelector('[data-job-sent]');
  if (sent) sent.onclick = async () => { if (await updateJobApplication(id, { status: 'aplicada' }, 'Marcada como aplicada')) openJobDetail(id); };
  const copy = box.querySelector('[data-job-copy]');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(box.querySelector('[data-job-letter]').value); showToast('Carta copiada'); }
    catch (err) { showToast('No se pudo copiar', 'error'); }
  };
  box.querySelector('[data-job-status]').onchange = async (e) => { if (await updateJobApplication(id, { status: e.target.value }, 'Estado actualizado')) openJobDetail(id); };
  box.querySelector('[data-job-save]').onclick = async () => {
    const ok = await updateJobApplication(id, {
      cover_letter: box.querySelector('[data-job-letter]').value,
      notes: box.querySelector('[data-job-notes]').value,
    }, 'Guardado');
    if (ok) closeJobDetail();
  };

  ov.classList.remove('hidden');
  ov.classList.add('flex');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeJobDetail(); });

function cap(s) {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
