// geocode.js — recherche de lieux (ville/pays → lat/lng) via Nominatim (OSM).
// Politique d'usage : 1 req/s max, on debounce + on met en cache. Repli : saisie
// manuelle des coordonnées dans le formulaire.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const _cache = new Map(); // query(lower) -> results[]

/**
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{label:string, short:string, lat:number, lng:number}>>}
 */
export async function searchPlaces(query, signal) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  if (_cache.has(key)) return _cache.get(key);

  const url = new URL(ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', q);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('accept-language', 'fr');

  let data;
  try {
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    return []; // hors-ligne ou bloqué : on laisse la saisie manuelle prendre le relais
  }

  const results = (data || []).map((d) => {
    const a = d.address || {};
    const city =
      a.city || a.town || a.village || a.municipality || a.hamlet || d.name || '';
    const country = a.country || '';
    const short = [city, country].filter(Boolean).join(', ') || d.display_name;
    return {
      label: d.display_name,
      short,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    };
  });
  _cache.set(key, results);
  return results;
}

/** Validation simple de coordonnées saisies à la main. */
export function parseLatLng(latStr, lngStr) {
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
