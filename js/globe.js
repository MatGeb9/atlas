// globe.js — globe 3D (globe.gl / three.js). Affiche un « pin photo » par fiche
// à son lieu principal, des points pour les lieux secondaires, et des arcs animés
// reliant les lieux d'une même fiche (effet façon Polarsteps).

import { photoUrl } from './store.js';
import { esc, safeColor } from './util.js';
import { loadCountries, featureContains } from './countries.js';

const TEXTURES = {
  night: './vendor/textures/earth-night.jpg',
  blue: './vendor/textures/earth-blue-marble.jpg',
  dark: './vendor/textures/earth-dark.jpg',
};

/** Normalise un lieu en {label, lat:number, lng:number} ou null si invalide. */
function pt(o, kind) {
  if (!o) return null;
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: o.label, note: o.note, lat, lng, kind };
}

/** Lieux ordonnés et valides d'une fiche (origine → rencontre → autres). */
function orderedPoints(person) {
  const pts = [];
  const o = pt(person.origin, 'origin'); if (o) pts.push(o);
  const m = pt(person.metPlace, 'met'); if (m) pts.push(m);
  for (const pl of person.places || []) { const x = pt(pl, 'place'); if (x) pts.push(x); }
  return pts;
}

function primaryPoint(person) {
  return pt(person.metPlace, 'met') || pt(person.origin, 'origin')
    || (person.places || []).map((p) => pt(p, 'place')).find(Boolean) || null;
}

function buildLayers(people) {
  const avatars = [];
  const points = [];
  const arcs = [];

  for (const person of people) {
    const color = safeColor(person.color);
    const primary = primaryPoint(person);
    const ordered = orderedPoints(person);

    if (primary) {
      avatars.push({ id: person.id, person, lat: primary.lat, lng: primary.lng, color });
    }

    // Points secondaires : tous sauf le point principal.
    for (const pt of ordered) {
      if (primary && pt.lat === primary.lat && pt.lng === primary.lng) continue;
      points.push({
        id: person.id, person, color,
        lat: pt.lat, lng: pt.lng,
        label: `${esc(person.name || 'Fiche')} — ${esc(pt.label || '')}`,
      });
    }

    // Arcs : on relie les lieux successifs de la fiche.
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i], b = ordered[i + 1];
      if (a.lat === b.lat && a.lng === b.lng) continue;
      arcs.push({
        startLat: a.lat, startLng: a.lng,
        endLat: b.lat, endLng: b.lng,
        color, id: person.id,
      });
    }
  }
  return { avatars, points, arcs };
}

function makePin(d, onClick) {
  const el = document.createElement('div');
  el.className = 'globe-pin';
  el.style.setProperty('--c', d.color);
  const url = photoUrl(d.person.photoId);
  const initial = (d.person.name || '?').trim().charAt(0).toUpperCase() || '?';
  el.innerHTML = `
    <div class="globe-pin__dot">
      <div class="globe-pin__img">${
        url ? `<img src="${esc(url)}" alt="">` : `<span>${esc(initial)}</span>`
      }</div>
      <span class="globe-pin__pulse"></span>
    </div>
    <div class="globe-pin__label">${esc(d.person.name || 'Fiche')}</div>`;
  el.title = d.person.name || 'Fiche';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(d.id);
  });
  return el;
}

/**
 * @param {HTMLElement} container
 * @param {{onPersonClick:(id:string)=>void, settings:object}} opts
 */
export function initGlobe(container, { onPersonClick, settings }) {
  if (typeof window.Globe !== 'function') {
    container.innerHTML =
      '<div class="globe-error">Moteur de globe introuvable (vendor/globe.gl.min.js).</div>';
    return { update() {}, focusOn() {}, setTexture() {}, setAutoRotate() {}, setArcs() {}, destroy() {} };
  }

  const world = window.Globe({ animateIn: true })(container)
    .backgroundImageUrl('./vendor/textures/night-sky.png')
    .globeImageUrl(TEXTURES[settings.texture] || TEXTURES.night)
    .bumpImageUrl('./vendor/textures/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('#6C5CE7')
    .atmosphereAltitude(0.18)
    // Avatars (pins photo)
    .htmlElementsData([])
    .htmlLat('lat').htmlLng('lng').htmlAltitude(0.012)
    .htmlElement((d) => makePin(d, onPersonClick))
    // Points secondaires
    .pointsData([])
    .pointLat('lat').pointLng('lng').pointColor('color')
    .pointAltitude(0.012).pointRadius(0.28)
    .pointLabel('label')
    .onPointClick((d) => onPersonClick(d.id))
    // Arcs
    .arcsData([])
    .arcStartLat('startLat').arcStartLng('startLng')
    .arcEndLat('endLat').arcEndLng('endLng')
    .arcColor('color')
    .arcAltitudeAutoScale(0.45)
    .arcStroke(0.5)
    .arcDashLength(0.4).arcDashGap(0.18).arcDashAnimateTime(2200)
    // Pays d'origine (colorisation optionnelle)
    .polygonsData([])
    .polygonCapColor((d) => `rgba(108,92,231,${Math.min(0.72, 0.28 + ((d.__count || 1) - 1) * 0.16)})`)
    .polygonSideColor(() => 'rgba(108,92,231,0.10)')
    .polygonStrokeColor(() => 'rgba(160,148,245,0.55)')
    .polygonAltitude(0.008);

  // Contrôles
  const controls = world.controls();
  controls.autoRotate = !!settings.autoRotate;
  controls.autoRotateSpeed = 0.45;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  world.pointOfView({ lat: 25, lng: 10, altitude: 2.4 }, 0);

  // Pause de la rotation auto pendant l'interaction de l'utilisateur.
  let rotateWanted = !!settings.autoRotate;
  container.addEventListener('pointerdown', () => { controls.autoRotate = false; });
  container.addEventListener('pointerup', () => { controls.autoRotate = rotateWanted; });

  // Réactif à la taille du conteneur.
  const resize = () => {
    world.width(container.clientWidth).height(container.clientHeight);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  let showArcs = settings.showArcs !== false;

  return {
    update(people) {
      const { avatars, points, arcs } = buildLayers(people);
      world.htmlElementsData(avatars);
      world.pointsData(points);
      world.arcsData(showArcs ? arcs : []);
    },
    focusOn(person) {
      const p = primaryPoint(person);
      if (p) world.pointOfView({ lat: p.lat, lng: p.lng, altitude: 1.6 }, 1100);
    },
    setTexture(name) {
      world.globeImageUrl(TEXTURES[name] || TEXTURES.night);
    },
    setAutoRotate(on) {
      rotateWanted = !!on;
      controls.autoRotate = !!on;
    },
    setArcs(on, people) {
      showArcs = !!on;
      const { arcs } = buildLayers(people || []);
      world.arcsData(showArcs ? arcs : []);
    },
    async setColorize(on, people) {
      if (!on) { world.polygonsData([]); return; }
      const feats = await loadCountries();
      const counts = new Map();
      for (const p of people || []) {
        const o = p.origin;
        if (!o) continue;
        const lat = Number(o.lat), lng = Number(o.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const f = feats.find((ft) => featureContains(ft, lng, lat));
        if (f) counts.set(f.properties.NAME, (counts.get(f.properties.NAME) || 0) + 1);
      }
      const out = feats.filter((f) => counts.has(f.properties.NAME))
        .map((f) => ({ type: f.type, properties: f.properties, geometry: f.geometry, __count: counts.get(f.properties.NAME) }));
      world.polygonsData(out);
    },
    destroy() {
      ro.disconnect();
      try { world._destructor && world._destructor(); } catch (_) {}
      container.innerHTML = '';
    },
  };
}
