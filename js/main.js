// main.js — point d'entrée : initialise le globe, le store, la navigation.

import * as store from './store.js';
import * as autosave from './autosave.js';
import { initGlobe } from './globe.js';
import { renderForm } from './form.js';
import { renderListView, renderDetail, renderSettings, renderDashboard } from './views.js';
import { toast } from './util.js';

const $ = (id) => document.getElementById(id);

let globeCtl = null;
let lastPanelKey = '__init__';
let lastColorizeRev = -1;
let lastApplied = { texture: null, autoRotate: null, showArcs: null, theme: null, colorize: null };

function applyGlobeSettings(state) {
  const s = state.settings;
  if (s.texture !== lastApplied.texture) { globeCtl?.setTexture(s.texture); lastApplied.texture = s.texture; }
  if (s.autoRotate !== lastApplied.autoRotate) { globeCtl?.setAutoRotate(s.autoRotate); lastApplied.autoRotate = s.autoRotate; }
  if (s.showArcs !== lastApplied.showArcs) { globeCtl?.setArcs(s.showArcs, state.people); lastApplied.showArcs = s.showArcs; }
  if (s.colorizeCountries !== lastApplied.colorize) {
    globeCtl?.setColorize(s.colorizeCountries, state.people);
    lastApplied.colorize = s.colorizeCountries;
    lastColorizeRev = state.dataRev;
  }
  if (s.theme !== lastApplied.theme) {
    document.body.classList.toggle('theme-light', s.theme === 'light');
    lastApplied.theme = s.theme;
  }
}

function renderPanel(state) {
  const panel = $('panel');
  const overlay = $('panel-overlay');
  const key = state.panel ? `${state.panel}:${state.editingId}:${state.selectedId}` : '';
  if (key === lastPanelKey) return;
  lastPanelKey = key;

  if (!state.panel) {
    panel.classList.remove('is-open');
    overlay.classList.remove('is-open');
    return;
  }
  overlay.classList.add('is-open');
  const body = $('panel-body');
  const title = $('panel-title');
  body.innerHTML = '';
  if (state.panel === 'form') {
    title.textContent = state.editingId ? 'Modifier la fiche' : 'Nouvelle fiche';
    renderForm(body);
  } else if (state.panel === 'detail') {
    const p = store.personById(state.selectedId);
    title.textContent = p ? p.name || 'Fiche' : 'Fiche';
    renderDetail(body);
  } else if (state.panel === 'settings') {
    title.textContent = 'Réglages';
    renderSettings(body);
  }
  panel.classList.add('is-open');
}

function render(state) {
  if (!state.ready) return;

  // Vue active (le globe reste monté en fond ; liste / dashboard recouvrent).
  $('view-list').classList.toggle('is-active', state.view === 'list');
  $('view-dashboard').classList.toggle('is-active', state.view === 'dashboard');
  $('btn-globe').classList.toggle('is-active', state.view === 'globe');
  $('btn-list').classList.toggle('is-active', state.view === 'list');
  $('btn-dashboard').classList.toggle('is-active', state.view === 'dashboard');
  if (state.view === 'list') renderListView($('view-list'));
  if (state.view === 'dashboard') renderDashboard($('view-dashboard'));

  // Globe : données + réglages.
  globeCtl?.update(state.people);
  applyGlobeSettings(state);
  if (state.settings.colorizeCountries && state.dataRev !== lastColorizeRev) {
    lastColorizeRev = state.dataRev;
    globeCtl?.setColorize(true, state.people);
  }

  // Recherche (sans casser le curseur).
  const search = $('search');
  if (search && search.value !== state.filter) search.value = state.filter;

  renderPanel(state);
}

function wireChrome() {
  $('btn-add').addEventListener('click', () => store.openForm(null));
  $('btn-globe').addEventListener('click', () => store.setView('globe'));
  $('btn-list').addEventListener('click', () => store.setView('list'));
  $('btn-dashboard').addEventListener('click', () => store.setView('dashboard'));
  $('btn-settings').addEventListener('click', () => store.openSettings());
  $('panel-close').addEventListener('click', () => store.closePanel());
  $('panel-overlay').addEventListener('click', () => store.closePanel());
  $('search').addEventListener('input', (e) => store.setFilter(e.target.value));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.getState().panel) store.closePanel();
  });

  // « Voir sur le globe » depuis la fiche détaillée.
  window.addEventListener('atlas:focus', (e) => {
    const p = store.personById(e.detail);
    if (!p) return;
    store.setView('globe');
    store.closePanel();
    globeCtl?.focusOn(p);
  });
}

async function boot() {
  wireChrome();

  const state = store.getState();
  globeCtl = initGlobe($('globe'), {
    onPersonClick: (id) => store.openDetail(id),
    settings: state.settings,
  });
  lastApplied = {
    texture: state.settings.texture,
    autoRotate: state.settings.autoRotate,
    showArcs: state.settings.showArcs,
    theme: state.settings.theme,
  };
  document.body.classList.toggle('theme-light', state.settings.theme === 'light');

  store.subscribe(render);
  autosave.start();
  await store.init();

  // Sauvegarde auto en pause (permission à re-accorder après un rechargement) ?
  if (store.getState().settings.autoSave) {
    const st = await autosave.getStatus();
    if (st.linked && st.permission !== 'granted') {
      toast('Sauvegarde auto en pause — Réglages → Réactiver', 'info', 5000);
    }
  }

  // Service worker (offline) — seulement en http(s).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { await navigator.serviceWorker.register('./service-worker.js'); } catch (_) {}
  }
}

boot();
