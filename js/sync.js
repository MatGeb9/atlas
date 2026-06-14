// sync.js — deux mécanismes de partage entre appareils :
//   1) Export / import d'un fichier .atlas (chiffrable) — marche partout, zéro setup.
//   2) Synchro Supabase (optionnelle, chargée à la demande) — last-write-wins.

import * as db from './db.js';
import * as store from './store.js';
import { downloadBlob, toast, dataURLToBlob } from './util.js';

// ── Crypto (AES-GCM via PBKDF2) ──────────────────────────────────────────────

function ab2b64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b642ab(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptJSON(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { format: 'atlas-export-enc', version: 1, salt: ab2b64(salt), iv: ab2b64(iv), ct: ab2b64(ct) };
}

async function decryptJSON(payload, passphrase) {
  const salt = new Uint8Array(b642ab(payload.salt));
  const iv = new Uint8Array(b642ab(payload.iv));
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b642ab(payload.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ── Export / Import ─────────────────────────────────────────────────────────

/** Construit le contenu (string JSON) d'une sauvegarde, chiffré si passphrase. */
export async function buildBackupPayload(passphrase) {
  const data = await db.exportAll();
  const payload = passphrase ? await encryptJSON(data, passphrase) : data;
  return JSON.stringify(payload);
}

export async function exportBackup(passphrase) {
  try {
    const json = await buildBackupPayload(passphrase);
    const stamp = new Date().toISOString().slice(0, 10);
    // octet-stream (binaire générique) : sinon iOS force l'extension .json
    // d'après le type MIME et ignore le « .atlas » du nom de fichier.
    const blob = new Blob([json], { type: 'application/octet-stream' });
    downloadBlob(blob, `atlas-${stamp}.atlas`);
    toast(passphrase ? 'Sauvegarde chiffrée exportée' : 'Sauvegarde exportée (non chiffrée)',
      passphrase ? 'ok' : 'info');
  } catch (e) {
    console.error(e);
    toast('Échec de l’export', 'err');
  }
}

export async function importBackupFile(file, passphrase) {
  try {
    const text = await file.text();
    let payload = JSON.parse(text);
    if (payload.format === 'atlas-export-enc') {
      const pass = passphrase || prompt('Mot de passe de la sauvegarde :');
      if (!pass) return;
      payload = await decryptJSON(payload, pass);
    }
    if (!payload || payload.format !== 'atlas-export') throw new Error('format');
    const replace = confirm('OK = REMPLACER les données actuelles.\nAnnuler = FUSIONNER avec l’existant.');
    const res = await db.importAll(payload, replace ? 'replace' : 'merge');
    await store.refreshFromDb();
    toast(`Importé : ${res.people} fiche(s), ${res.photos} photo(s)`, 'ok');
  } catch (e) {
    console.error(e);
    toast('Fichier illisible ou mot de passe incorrect', 'err');
  }
}

// ── Synchro Supabase (optionnelle) ───────────────────────────────────────────

let _clientPromise = null;
async function getClient(url, key) {
  if (_clientPromise) return _clientPromise;
  // Version épinglée (pas de range) pour limiter le risque chaîne d'appro.
  _clientPromise = import('https://esm.sh/@supabase/supabase-js@2.39.8')
    .then((m) => m.createClient(url, key, {
      auth: { persistSession: true, detectSessionInUrl: false, storageKey: 'atlas-supabase-auth' },
    }));
  return _clientPromise;
}

/**
 * Auth e-mail + mot de passe (aucune redirection → marche sur n'importe quel
 * port local). Réutilise la session si déjà connecté ; crée le compte au 1er usage.
 */
async function ensureAuth(client, email, password) {
  const { data: { session } } = await client.auth.getSession();
  if (session) return session;
  if (!email) throw new Error('Renseigne ton e-mail dans les Réglages');
  if (!password) throw new Error('Entre ton mot de passe de synchro');

  const inRes = await client.auth.signInWithPassword({ email, password });
  if (inRes.data && inRes.data.session) return inRes.data.session;

  // Pas de compte → on le crée.
  if (inRes.error && /invalid login credentials/i.test(inRes.error.message || '')) {
    const upRes = await client.auth.signUp({ email, password });
    if (upRes.error) throw upRes.error;
    if (upRes.data && upRes.data.session) return upRes.data.session;
    throw new Error('Compte créé : confirme ton e-mail (ou désactive « Confirm email » dans Supabase) puis relance.');
  }
  if (inRes.error) throw inRes.error;
  return null;
}

export async function syncNow(password) {
  const s = store.getState().settings;
  if (!s.supabaseUrl || !s.supabaseAnonKey) {
    toast('Configure d’abord ton projet Supabase (Réglages)', 'err');
    return;
  }
  let client;
  try {
    client = await getClient(s.supabaseUrl, s.supabaseAnonKey);
  } catch (e) {
    toast('Impossible de charger Supabase (hors-ligne ?)', 'err');
    return;
  }

  // Auth e-mail + mot de passe (pas de redirection à configurer).
  let session;
  try {
    session = await ensureAuth(client, s.syncEmail, password);
  } catch (e) {
    toast(e.message || 'Échec de connexion', 'err', 6000);
    return;
  }
  if (!session) return;
  const userId = session.user.id;

  try {
    toast('Synchronisation…', 'info');
    const local = await db.exportAll();
    const photoById = {};
    for (const ph of local.photos) photoById[ph.id] = ph.dataURL;
    const localMap = new Map(local.people.map((p) => [p.id, p]));

    const { data: remoteRows, error } = await client
      .from('atlas_people').select('*').eq('user_id', userId);
    if (error) throw error;
    const remoteMap = new Map((remoteRows || []).map((r) => [r.id, r]));

    // Push : local plus récent (ou absent à distance).
    const toPush = [];
    for (const p of local.people) {
      const r = remoteMap.get(p.id);
      if (!r || (p.updatedAt || '') > (r.updated_at || '')) {
        toPush.push({
          id: p.id, user_id: userId, data: p,
          photo: p.photoId ? photoById[p.photoId] || null : null,
          updated_at: p.updatedAt || new Date().toISOString(),
        });
      }
    }
    if (toPush.length) {
      const { error: upErr } = await client.from('atlas_people').upsert(toPush);
      if (upErr) throw upErr;
    }

    // Pull : distant plus récent (ou absent en local).
    let pulled = 0;
    for (const r of remoteRows || []) {
      const localP = localMap.get(r.id);
      if (localP && (localP.updatedAt || '') >= (r.updated_at || '')) continue;
      const oldPhotoId = localP && localP.photoId;
      const person = r.data;
      if (r.photo) {
        const blob = await dataURLToBlob(r.photo);
        person.photoId = await db.putPhoto(blob, 'image/jpeg');
      } else {
        person.photoId = null;
      }
      await db.putPerson(person);
      if (oldPhotoId && oldPhotoId !== person.photoId) await db.deletePhoto(oldPhotoId);
      pulled++;
    }

    await store.refreshFromDb();
    await store.updateSettings({ lastSync: new Date().toISOString() });
    toast(`Synchro OK — ${toPush.length} envoyée(s), ${pulled} reçue(s)`, 'ok');
  } catch (e) {
    console.error(e);
    toast('Échec de la synchro : ' + (e.message || e), 'err', 6000);
  }
}
