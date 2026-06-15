// store.js — état central de l'app + actions. Pattern « pub/sub » minimal :
// les vues s'abonnent via subscribe() et sont notifiées à chaque emit().

import * as db from './db.js';
import { uid, nowISO, colorForId } from './util.js';

export const STATUS_OPTIONS = [
  'Crush', 'En cours', 'En couple', 'Ex', 'Amie', 'Aventure', 'Souvenir',
];

export const DEFAULT_SETTINGS = {
  texture: 'blue',      // 'blue' (couleur normale/jour) | 'night' | 'dark'
  textureMigrated: false, // bascule unique nuit→couleur normale (anciens réglages)
  theme: 'dark',        // 'dark' | 'light'
  autoRotate: true,
  showArcs: true,
  backupPass: '',            // mot de passe de chiffrement de la sauvegarde
  rememberBackupPass: false, // mémoriser ce mot de passe sur l'appareil
  autoSave: false,           // sauvegarde auto vers un fichier lié (Mac/PC)
  globalParams: [],          // clés de paramètres réutilisables (promues)
  colorizeCountries: false,  // colorier les pays d'origine sur le globe
  supabaseUrl: '',
  supabaseAnonKey: '',
  syncEmail: '',
  syncEnabled: false,
  lastSync: null,
};

export function newPerson() {
  const id = uid();
  return {
    id,
    name: '',
    photoId: null,       // photo pleine résolution (détail / visionneuse)
    thumbId: null,       // miniature 256px (globe, cartes, avatars)
    origin: null,        // { label, lat, lng }
    metPlace: null,      // { label, lat, lng }
    places: [],          // [{ label, lat, lng, note }]
    rating: null,        // note /10
    ageDiff: null,       // écart d'âge vs moi (années : + plus âgé·e / - plus jeune)
    status: '',
    tags: [],            // [string]
    date: '',            // date de rencontre 'YYYY-MM-DD'
    endDate: '',         // date de fin 'YYYY-MM-DD'
    fields: [],          // [{ key, value }] — paramètres personnalisés
    notes: '',
    color: colorForId(id),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

const state = {
  people: [],
  view: 'globe',         // 'globe' | 'list'
  panel: null,           // null | 'form' | 'detail' | 'settings'
  editingId: null,       // id en cours d'édition (ou null = nouvelle fiche)
  selectedId: null,      // fiche affichée en détail / ciblée sur le globe
  filter: '',
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
  dataRev: 0,            // incrémenté à chaque mutation de données (→ sauvegarde auto)
};

const listeners = new Set();
const _photoUrls = new Map(); // photoId -> objectURL

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

// ── Photos (cache d'URLs d'objets, créées une fois, révoquées au rechargement) ──

async function loadPhotoUrl(photoId) {
  if (!photoId || _photoUrls.has(photoId)) return;
  const rec = await db.getPhoto(photoId);
  if (rec && rec.blob) _photoUrls.set(photoId, URL.createObjectURL(rec.blob));
}

export function photoUrl(photoId) {
  return photoId ? _photoUrls.get(photoId) || null : null;
}

/** Miniature pour les petits rendus (globe/cartes/avatars) ; repli sur la pleine
 *  résolution pour les fiches anciennes sans miniature. */
export function thumbUrl(person) {
  if (!person) return null;
  return photoUrl(person.thumbId) || photoUrl(person.photoId);
}

function revokeAllPhotoUrls() {
  for (const url of _photoUrls.values()) URL.revokeObjectURL(url);
  _photoUrls.clear();
}

// ── Initialisation ────────────────────────────────────────────────────────────

export async function init() {
  const savedSettings = await db.getSetting('settings', null);
  state.settings = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
  // Bascule unique : le défaut est passé de « nuit » à « couleur normale ».
  if (!state.settings.textureMigrated) {
    if (state.settings.texture === 'night') state.settings.texture = 'blue';
    state.settings.textureMigrated = true;
    await db.setSetting('settings', state.settings);
  }
  await reloadPeople();
  state.ready = true;
  emit();
}

async function reloadPeople() {
  revokeAllPhotoUrls();
  const people = await db.allPeople();
  people.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  state.people = people;
  for (const p of people) { await loadPhotoUrl(p.photoId); await loadPhotoUrl(p.thumbId); }
}

// ── Navigation / UI ────────────────────────────────────────────────────────────

export function setView(view) { state.view = view; emit(); }

export function openForm(id = null) {
  state.editingId = id;
  state.panel = 'form';
  emit();
}

export function openDetail(id) {
  state.selectedId = id;
  state.panel = 'detail';
  emit();
}

export function openSettings() { state.panel = 'settings'; emit(); }

export function closePanel() {
  state.panel = null;
  state.editingId = null;
  emit();
}

export function setFilter(q) { state.filter = q || ''; emit(); }

export function selectOnGlobe(id) { state.selectedId = id; emit(); }

export function personById(id) {
  return state.people.find((p) => p.id === id) || null;
}

/** Fiches filtrées par la recherche (nom, statut, tags, lieux). */
export function filteredPeople() {
  const q = state.filter.trim().toLowerCase();
  if (!q) return state.people;
  return state.people.filter((p) => {
    const hay = [
      p.name, p.status, (p.tags || []).join(' '),
      p.origin && p.origin.label, p.metPlace && p.metPlace.label,
      ...(p.places || []).map((x) => x.label),
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export async function savePerson(person) {
  person.updatedAt = nowISO();
  await db.putPerson(person);
  await loadPhotoUrl(person.photoId);
  await loadPhotoUrl(person.thumbId);
  const i = state.people.findIndex((p) => p.id === person.id);
  if (i >= 0) state.people[i] = person; else state.people.unshift(person);
  state.people.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  state.selectedId = person.id;
  state.dataRev++;
  emit();
  return person;
}

export async function removePerson(id) {
  const p = personById(id);
  for (const pid of [p && p.photoId, p && p.thumbId]) {
    if (!pid) continue;
    await db.deletePhoto(pid);
    const url = _photoUrls.get(pid);
    if (url) { URL.revokeObjectURL(url); _photoUrls.delete(pid); }
  }
  await db.deletePerson(id);
  state.people = state.people.filter((x) => x.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  state.panel = null;
  state.dataRev++;
  emit();
}

export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.setSetting('settings', state.settings);
  emit();
}

/** Clés de paramètres connues : promues (globalParams) + utilisées sur des fiches. */
export function knownParamKeys() {
  const set = new Set(state.settings.globalParams || []);
  for (const p of state.people) for (const f of p.fields || []) if (f.key) set.add(f.key);
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function isDefaultParam(key) {
  return (state.settings.globalParams || []).includes((key || '').trim());
}

export async function promoteParam(key) {
  key = (key || '').trim();
  if (!key) return;
  const gp = state.settings.globalParams || [];
  if (!gp.includes(key)) await updateSettings({ globalParams: [...gp, key] });
}

export async function demoteParam(key) {
  key = (key || '').trim();
  const gp = (state.settings.globalParams || []).filter((k) => k !== key);
  await updateSettings({ globalParams: gp });
}

/** Valeurs déjà saisies pour une clé de paramètre (les plus fréquentes d'abord). */
export function paramValues(key) {
  key = (key || '').trim();
  if (!key) return [];
  const counts = new Map();
  for (const p of state.people) {
    for (const f of p.fields || []) {
      const v = (f.value || '').trim();
      if ((f.key || '').trim() === key && v) counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map((e) => e[0]);
}

/** Rechargement complet (après import / sync). */
export async function refreshFromDb() {
  await reloadPeople();
  state.dataRev++;
  emit();
}
