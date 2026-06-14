// autosave.js — sauvegarde automatique vers un fichier lié (Mac / PC, Chrome/Edge).
// Utilise la File System Access API : on lie UNE fois un fichier (ex. dans iCloud
// Drive), son « handle » est mémorisé dans IndexedDB, et on y réécrit à chaque modif.
// Non supporté par Safari / iOS (Apple) → la section reste cachée là-bas.

import * as db from './db.js';
import * as store from './store.js';
import { buildBackupPayload } from './sync.js';
import { toast, debounce } from './util.js';

const HANDLE_KEY = 'autoSaveHandle';
let _handle = null;
let _lastRev = -1;
let _writing = false;

export function isSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

async function handle() {
  if (_handle) return _handle;
  _handle = await db.getSetting(HANDLE_KEY, null);
  return _handle;
}

async function hasPermission(h, request = false) {
  if (!h || !h.queryPermission) return !!h; // navigateurs sans l'API de permission
  const opts = { mode: 'readwrite' };
  if ((await h.queryPermission(opts)) === 'granted') return true;
  if (request && (await h.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** { linked, name, permission: 'granted'|'prompt'|'denied' } */
export async function getStatus() {
  const h = await handle();
  if (!h) return { linked: false };
  let permission = 'granted';
  try { if (h.queryPermission) permission = await h.queryPermission({ mode: 'readwrite' }); } catch (_) {}
  return { linked: true, name: h.name, permission };
}

export async function link() {
  if (!isSupported()) { toast('Sauvegarde auto : seulement sur Mac/PC (Chrome/Edge)', 'err', 5000); return false; }
  if (!store.getState().settings.backupPass) {
    toast('Définis d’abord un mot de passe de chiffrement (coche « mémoriser »)', 'err', 5000);
    return false;
  }
  try {
    const h = await window.showSaveFilePicker({
      suggestedName: 'atlas.atlas',
      types: [{ description: 'Sauvegarde Atlas', accept: { 'application/json': ['.atlas'] } }],
    });
    _handle = h;
    await db.setSetting(HANDLE_KEY, h);
    await store.updateSettings({ autoSave: true });
    _lastRev = store.getState().dataRev;
    await saveNow(true);
    toast('Sauvegarde auto activée → ' + h.name, 'ok');
    return true;
  } catch (e) {
    if (e && e.name !== 'AbortError') { console.error(e); toast('Impossible de lier le fichier', 'err'); }
    return false;
  }
}

export async function reactivate() {
  const h = await handle();
  if (!h) return false;
  const ok = await hasPermission(h, true);
  if (ok) { await saveNow(true); toast('Sauvegarde auto réactivée', 'ok'); }
  else toast('Autorisation refusée', 'err');
  return ok;
}

export async function unlink() {
  _handle = null;
  await db.setSetting(HANDLE_KEY, null);
  await store.updateSettings({ autoSave: false });
  toast('Sauvegarde auto désactivée', 'info');
}

export async function saveNow(force = false) {
  if (_writing) return;
  const s = store.getState().settings;
  if (!s.autoSave && !force) return;
  const h = await handle();
  if (!h) return;
  const pass = s.backupPass;
  if (!pass) return;                          // chiffrement requis
  if (!(await hasPermission(h, false))) return; // pas d'autorisation sans geste utilisateur
  _writing = true;
  try {
    const json = await buildBackupPayload(pass);
    const w = await h.createWritable();
    await w.write(json);
    await w.close();
  } catch (e) {
    console.error('autosave', e);
  } finally {
    _writing = false;
  }
}

const _debounced = debounce(() => saveNow(false), 1500);

/** À appeler une fois au démarrage : déclenche une sauvegarde après chaque modif. */
export function start() {
  store.subscribe((state) => {
    if (state.dataRev === _lastRev) return;
    _lastRev = state.dataRev;
    if (state.settings.autoSave) _debounced();
  });
}
