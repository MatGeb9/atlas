// countries.js — pays (GeoJSON vendored) + point-in-polygon, pour colorier le globe
// et classer les fiches par pays d'origine. Aucune dépendance.

let _featuresPromise = null;

export function loadCountries() {
  if (!_featuresPromise) {
    _featuresPromise = fetch('./vendor/countries-110m.geojson')
      .then((r) => r.json())
      .then((g) => g.features || [])
      .catch(() => []);
  }
  return _featuresPromise;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon) {
  if (!pointInRing(lng, lat, polygon[0])) return false;           // hors contour
  for (let i = 1; i < polygon.length; i++) {                       // dans un trou ?
    if (pointInRing(lng, lat, polygon[i])) return false;
  }
  return true;
}

export function featureContains(feature, lng, lat) {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return pointInPolygon(lng, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
  return false;
}

export async function featureAt(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const feats = await loadCountries();
  return feats.find((f) => featureContains(f, lng, lat)) || null;
}

export async function countryNameAt(lng, lat) {
  const f = await featureAt(lng, lat);
  return f ? (f.properties.NAME || null) : null;
}
