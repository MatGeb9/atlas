// db.js — persistance locale via IndexedDB (fiches, photos, réglages).
// Aucune dépendance : petit wrapper Promise autour d'IndexedDB.

import { uid, blobToDataURL, dataURLToBlob } from './util.js';

const DB_NAME = 'atlas';
const DB_VERSION = 1;
const STORE_PEOPLE = 'people';
const STORE_PHOTOS = 'photos';
const STORE_KV = 'kv';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PEOPLE)) {
        db.createObjectStore(STORE_PEOPLE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => {
    const t = db.transaction(store, mode);
    return { store: t.objectStore(store), done: txDone(t) };
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction abort'));
  });
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Fiches ─────────────────────────────────────────────────────────────────

export async function allPeople() {
  const { store } = await tx(STORE_PEOPLE);
  return reqAsPromise(store.getAll());
}

export async function getPerson(id) {
  const { store } = await tx(STORE_PEOPLE);
  return reqAsPromise(store.get(id));
}

export async function putPerson(person) {
  const { store, done } = await tx(STORE_PEOPLE, 'readwrite');
  store.put(person);
  await done;
  return person;
}

export async function deletePerson(id) {
  const { store, done } = await tx(STORE_PEOPLE, 'readwrite');
  store.delete(id);
  await done;
}

// ── Photos (stockées en Blob) ────────────────────────────────────────────────

export async function putPhoto(blob, type = 'image/jpeg') {
  const id = uid();
  const { store, done } = await tx(STORE_PHOTOS, 'readwrite');
  store.put({ id, blob, type });
  await done;
  return id;
}

export async function getPhoto(id) {
  if (!id) return null;
  const { store } = await tx(STORE_PHOTOS);
  return reqAsPromise(store.get(id));
}

export async function deletePhoto(id) {
  if (!id) return;
  const { store, done } = await tx(STORE_PHOTOS, 'readwrite');
  store.delete(id);
  await done;
}

// ── Réglages (clé/valeur) ─────────────────────────────────────────────────────

export async function getSetting(key, fallback = null) {
  const { store } = await tx(STORE_KV);
  const row = await reqAsPromise(store.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const { store, done } = await tx(STORE_KV, 'readwrite');
  store.put({ key, value });
  await done;
}

// ── Export / Import (sauvegarde transférable entre appareils) ──────────────────

export async function exportAll() {
  const people = await allPeople();
  const { store } = await tx(STORE_PHOTOS);
  const photos = await reqAsPromise(store.getAll());
  const photosOut = [];
  for (const p of photos) {
    photosOut.push({ id: p.id, type: p.type, dataURL: await blobToDataURL(p.blob) });
  }
  return {
    format: 'atlas-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    people,
    photos: photosOut,
  };
}

/**
 * Importe une sauvegarde. mode 'merge' (défaut) conserve les fiches existantes
 * et écrase celles de même id ; mode 'replace' efface tout d'abord.
 */
export async function importAll(data, mode = 'merge') {
  if (!data || data.format !== 'atlas-export') {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }
  if (mode === 'replace') await clearAll();

  const db = await openDB();
  // Photos d'abord (les fiches y font référence).
  for (const ph of data.photos || []) {
    const blob = await dataURLToBlob(ph.dataURL);
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE_PHOTOS, 'readwrite');
      t.objectStore(STORE_PHOTOS).put({ id: ph.id, blob, type: ph.type });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
  for (const person of data.people || []) {
    await putPerson(person);
  }
  return { people: (data.people || []).length, photos: (data.photos || []).length };
}

export async function clearAll() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction([STORE_PEOPLE, STORE_PHOTOS], 'readwrite');
    t.objectStore(STORE_PEOPLE).clear();
    t.objectStore(STORE_PHOTOS).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
