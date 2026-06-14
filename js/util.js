// util.js — petites fonctions partagées (aucune dépendance).

export function uid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowISO() {
  return new Date().toISOString();
}

/** Échappe le HTML pour insertion sûre dans innerHTML. */
export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Debounce : retarde l'appel tant que ça « tape ». */
export function debounce(fn, ms = 400) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Palette vive pour les points/arcs sur le globe (choisie par hash de l'id). */
const PALETTE = [
  '#6C5CE7', '#E84393', '#00CEC9', '#F4B860', '#0EA5E9',
  '#A55EEA', '#26DE81', '#FD79A8', '#FAB1A0', '#74B9FF',
  '#E17055', '#55EFC4', '#FF7675', '#81ECEC', '#FFEAA7',
];

export function colorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const ALL_COLORS = PALETTE;

/** Valide une couleur avant de l'injecter dans un attribut style (anti-injection CSS). */
export function safeColor(c) {
  return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '#6C5CE7';
}

/**
 * Redimensionne une image (File/Blob) côté client en JPEG.
 * @returns {Promise<Blob>}
 */
export function resizeImage(fileOrBlob, maxDim = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob a échoué'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Convertit un data URL en Blob SANS `fetch` (un fetch vers `data:` est bloqué
 * par la Content-Security-Policy → l'import des photos échouait). Décodage direct.
 */
export function dataURLToBlob(dataURL) {
  const comma = dataURL.indexOf(',');
  const header = dataURL.slice(0, comma);
  const data = dataURL.slice(comma + 1);
  const mime = (header.match(/data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  let bytes;
  if (/;base64/i.test(header)) {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(data));
  }
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Enregistre un fichier. Sur appareil tactile (iPhone/iPad), passe par le
 * PARTAGE NATIF (`navigator.share`) — fiable pour les gros fichiers (le
 * téléchargement <a download> tronque en mode app installée). Desktop → download.
 * @returns {Promise<boolean>} false si l'utilisateur a annulé.
 */
export async function shareOrDownload(blob, filename) {
  const isTouch = (navigator.maxTouchPoints || 0) > 0;
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      // IMPORTANT : partager UNIQUEMENT le fichier — surtout pas de `title`/`text`,
      // sinon iOS crée un 2e fichier .txt (le titre) à côté du .atlas.
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // annulé par l'utilisateur
      console.error('partage échoué, repli téléchargement', e);
    }
  }
  downloadBlob(blob, filename);
  return true;
}

/** Toast non bloquant en bas de l'écran. */
export function toast(msg, kind = 'info', ms = 3200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => {
    el.classList.remove('toast--in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/**
 * Mini-helper de création DOM.
 *   h('div', {class:'x', onclick:fn}, 'texte', h('span', {}, '!'))
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Distance approximative (km) entre deux points lat/lng — pour trier/relier. */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
