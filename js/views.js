// views.js — liste (grille de cartes), fiche détaillée, réglages.

import * as store from './store.js';
import { h, esc, fmtDate, toast, safeColor } from './util.js';
import { exportBackup, importBackupFile, syncNow } from './sync.js';
import * as autosave from './autosave.js';
import { countryNameAt } from './countries.js';
import { avatarDataUrl } from './avatar.js';

function ageDiffStr(n) {
  if (n === 0) return 'même âge';
  const a = Math.abs(n);
  return `${n > 0 ? '+' : '−'}${a} an${a > 1 ? 's' : ''} (${n > 0 ? 'plus âgé·e' : 'plus jeune'})`;
}

function durationStr(start, end) {
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return '';
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} an${y > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} mois`);
  return parts.join(' ') || 'moins d’un mois';
}

function avatar(person, cls = '') {
  const url = store.thumbUrl(person) || (person.avatar ? avatarDataUrl(person.avatar) : null);
  const initial = (person.name || '?').trim().charAt(0).toUpperCase() || '?';
  return h('div', { class: 'avatar ' + cls, style: `--c:${safeColor(person.color)}` },
    url ? h('img', { src: url, alt: '' }) : h('span', {}, initial));
}

/** Visionneuse plein écran : tap/clic sur l'image bascule entre « ajusté » et 1:1
 *  (zoom natif), tap sur le fond ou ✕ pour fermer, Échap aussi. */
let _closeLightbox = null;
function openLightbox(url) {
  if (!url) return;
  if (_closeLightbox) _closeLightbox(); // pas d'empilement (double-tap, orphelin)
  const img = h('img', { class: 'lightbox__img', src: url, alt: '' });
  img.addEventListener('click', (e) => { e.stopPropagation(); img.classList.toggle('is-zoomed'); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    _closeLightbox = null;
  };
  const box = h('div', { class: 'lightbox', onclick: close },
    h('button', { class: 'lightbox__close', title: 'Fermer', onclick: (e) => { e.stopPropagation(); close(); } }, '✕'),
    img);
  _closeLightbox = close;
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

/** Sélecteur affiché quand plusieurs fiches partagent un même lieu (pin groupé). */
export function openPlacePicker(people) {
  if (!people || !people.length) return;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const items = people.slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))
    .map((p) => h('button', {
      class: 'placepick__item',
      onclick: () => { close(); store.openDetail(p.id); },
    },
      avatar(p, 'avatar--lg'),
      h('div', { class: 'placepick__meta' },
        h('strong', {}, esc(p.name || 'Sans nom')),
        p.status ? h('span', { class: 'muted' }, esc(p.status)) : null)));
  const box = h('div', { class: 'lightbox', onclick: (e) => { if (e.target === box) close(); } },
    h('div', { class: 'placepick' },
      h('h3', {}, `${people.length} fiches à ce lieu`),
      h('div', { class: 'placepick__list' }, ...items)));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

function ratingBar(rating) {
  if (rating == null) return null;
  return h('div', { class: 'ratingbar', title: `${rating}/10` },
    h('div', { class: 'ratingbar__fill', style: `width:${rating * 10}%` }),
    h('span', { class: 'ratingbar__num' }, `${rating}/10`));
}

// ── Grille de cartes ───────────────────────────────────────────────────────────

export function renderListView(viewEl) {
  viewEl.innerHTML = '';
  const people = store.filteredPeople();

  if (!store.getState().people.length) {
    viewEl.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'empty__icon' }, '🌍'),
      h('h2', {}, 'Aucune fiche pour l’instant'),
      h('p', {}, 'Ajoute ta première fiche : photo, lieu de rencontre, souvenirs…'),
      h('button', { class: 'btn btn--primary', onclick: () => store.openForm(null) }, '+ Nouvelle fiche')));
    return;
  }
  if (!people.length) {
    viewEl.appendChild(h('div', { class: 'empty' }, h('p', {}, 'Aucun résultat pour cette recherche.')));
    return;
  }

  const grid = h('div', { class: 'cards' });
  for (const p of people) {
    const place = p.metPlace || p.origin;
    grid.appendChild(h('article', { class: 'card', onclick: () => store.openDetail(p.id) },
      h('div', { class: 'card__top' },
        avatar(p, 'avatar--lg'),
        h('div', { class: 'card__head' },
          h('h3', {}, esc(p.name || 'Sans nom')),
          p.status ? h('span', { class: 'badge', style: `--c:${safeColor(p.color)}` }, esc(p.status)) : null)),
      place ? h('div', { class: 'card__place' }, '📍 ', esc(place.label || '')) : null,
      p.date ? h('div', { class: 'card__date' }, '🗓️ ', fmtDate(p.date)) : null,
      ratingBar(p.rating),
      (p.tags && p.tags.length)
        ? h('div', { class: 'chips chips--ro' }, ...p.tags.slice(0, 4).map((t) => h('span', { class: 'chip chip--ro' }, esc(t))))
        : null));
  }
  viewEl.appendChild(grid);
}

// ── Fiche détaillée ────────────────────────────────────────────────────────────

function infoRow(icon, label, value) {
  if (!value) return null;
  return h('div', { class: 'inforow' },
    h('span', { class: 'inforow__icon' }, icon),
    h('div', {}, h('div', { class: 'inforow__label' }, label), h('div', { class: 'inforow__val' }, value)));
}

export function renderDetail(bodyEl) {
  const p = store.personById(store.getState().selectedId);
  bodyEl.innerHTML = '';
  if (!p) { bodyEl.appendChild(h('p', {}, 'Fiche introuvable.')); return; }

  const heroPhoto = store.photoUrl(p.photoId) || (p.avatar ? avatarDataUrl(p.avatar) : null);
  const heroAv = avatar(p, 'avatar--xl' + (heroPhoto ? ' avatar--zoom' : ''));
  if (heroPhoto) heroAv.addEventListener('click', () => openLightbox(heroPhoto));

  const places = [];
  if (p.origin) places.push(['Origine', p.origin]);
  if (p.metPlace) places.push(['Rencontre', p.metPlace]);
  (p.places || []).forEach((pl) => places.push([pl.note || 'Lieu', pl]));

  bodyEl.appendChild(h('div', { class: 'detail' },
    h('div', { class: 'detail__hero' },
      heroAv,
      h('div', {},
        h('h2', {}, esc(p.name || 'Sans nom')),
        p.status ? h('span', { class: 'badge', style: `--c:${safeColor(p.color)}` }, esc(p.status)) : null,
        ratingBar(p.rating))),

    h('div', { class: 'detail__actions' },
      h('button', { class: 'btn btn--primary', onclick: () => store.openForm(p.id) }, '✏️ Modifier'),
      h('button', {
        class: 'btn btn--ghost',
        onclick: () => { window.dispatchEvent(new CustomEvent('atlas:focus', { detail: p.id })); },
      }, '🌍 Voir sur le globe')),

    p.date ? infoRow('🗓️', 'Rencontre', fmtDate(p.date)) : null,
    p.endDate ? infoRow('🏁', 'Fin', fmtDate(p.endDate)) : null,
    (p.date && p.endDate) ? infoRow('⏳', 'Durée', durationStr(p.date, p.endDate)) : null,
    (p.ageDiff != null) ? infoRow('🎂', 'Écart d’âge', ageDiffStr(p.ageDiff)) : null,

    places.length
      ? h('div', { class: 'detail__section' },
          h('h4', {}, 'Lieux'),
          ...places.map(([lbl, pl]) => h('div', { class: 'placeline' },
            h('span', { class: 'placeline__dot', style: `--c:${safeColor(p.color)}` }),
            h('div', {}, h('strong', {}, esc(lbl)), h('div', { class: 'placeline__sub' }, esc(pl.label || `${pl.lat?.toFixed?.(3)}, ${pl.lng?.toFixed?.(3)}`))))))
      : null,

    (p.tags && p.tags.length)
      ? h('div', { class: 'detail__section' }, h('h4', {}, 'Tags'),
          h('div', { class: 'chips chips--ro' }, ...p.tags.map((t) => h('span', { class: 'chip chip--ro' }, esc(t)))))
      : null,

    (p.fields && p.fields.length)
      ? h('div', { class: 'detail__section' }, h('h4', {}, 'Paramètres'),
          h('div', { class: 'kvlist' }, ...p.fields.map((f) => h('div', { class: 'kvline' },
            h('span', { class: 'kvline__k' }, esc(f.key)), h('span', { class: 'kvline__v' }, esc(f.value))))))
      : null,

    p.notes
      ? h('div', { class: 'detail__section' }, h('h4', {}, 'Notes & souvenirs'),
          h('p', { class: 'detail__notes' }, esc(p.notes)))
      : null));
}

// ── Réglages ───────────────────────────────────────────────────────────────────

export function renderSettings(bodyEl) {
  const s = store.getState().settings;
  bodyEl.innerHTML = '';

  const sel = (key, label, options) => {
    const select = h('select', { onchange: (e) => store.updateSettings({ [key]: e.target.value }) },
      ...options.map(([v, t]) => h('option', { value: v, selected: s[key] === v }, t)));
    return h('div', { class: 'field' }, h('label', {}, label), select);
  };
  const toggle = (key, label) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => store.updateSettings({ [key]: e.target.checked }) }),
    h('span', {}, label));

  // Sync (Supabase) — optionnel
  const urlIn = h('input', { type: 'url', value: s.supabaseUrl || '', placeholder: 'https://xxxx.supabase.co', 'aria-label': 'URL du projet Supabase' });
  const keyIn = h('input', { type: 'password', value: s.supabaseAnonKey || '', placeholder: 'clé anon (publique)', 'aria-label': 'Clé anon Supabase' });
  const emailIn = h('input', { type: 'email', value: s.syncEmail || '', placeholder: 'ton e-mail', autocomplete: 'username', 'aria-label': 'E-mail de synchro' });
  const passIn = h('input', { type: 'password', placeholder: 'mot de passe de synchro', autocomplete: 'current-password', 'aria-label': 'Mot de passe de synchro' });

  // Sauvegarde chiffrée (iCloud)
  const passBackupIn = h('input', { type: 'password', value: s.backupPass || '', placeholder: 'mot de passe (recommandé)', autocomplete: 'new-password', 'aria-label': 'Mot de passe de chiffrement' });
  const doExport = () => {
    const pw = passBackupIn.value.trim();
    if (!pw && !confirm('Exporter SANS chiffrement ? Le fichier sera lisible par quiconque y a accès.')) return;
    if (store.getState().settings.rememberBackupPass) store.updateSettings({ backupPass: pw });
    exportBackup(pw);
  };

  const autoSaveBlock = () => {
    const status = h('div', { class: 'muted', style: 'margin:6px 0' }, 'Sauvegarde auto : …');
    const refresh = () => autosave.getStatus().then((st) => {
      if (!st.linked) status.textContent = 'Sauvegarde auto : non activée.';
      else if (st.permission === 'granted') status.textContent = '✅ Active → écrit dans « ' + st.name + ' » à chaque modif.';
      else status.textContent = '⏸️ En pause (' + st.name + ') — clique « Réactiver ».';
    });
    refresh();
    return h('div', { style: 'margin-top:14px' },
      h('label', {}, 'Sauvegarde automatique (Mac / PC)'),
      status,
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn--ghost', onclick: async () => { await autosave.link(); refresh(); } }, '🔗 Lier un fichier'),
        h('button', { class: 'btn btn--ghost', onclick: async () => { await autosave.reactivate(); refresh(); } }, 'Réactiver'),
        h('button', { class: 'btn btn--ghost', onclick: async () => { await autosave.unlink(); refresh(); } }, 'Désactiver')));
  };

  bodyEl.appendChild(h('div', { class: 'settings' },
    h('h3', {}, 'Apparence'),
    sel('theme', 'Thème de l’app', [['dark', 'Sombre'], ['light', 'Clair']]),
    sel('texture', 'Texture de la Terre', [['blue', 'Couleur normale (jour)'], ['live', '🌗 Jour / nuit en direct'], ['night', 'Nuit (lumières des villes)'], ['dark', 'Sombre épuré']]),
    h('div', { class: 'field' }, toggle('autoRotate', 'Rotation automatique')),
    h('div', { class: 'field' }, toggle('showArcs', 'Afficher les arcs entre lieux')),
    h('div', { class: 'field' }, toggle('colorizeCountries', 'Colorier les pays d’origine sur le globe')),

    h('hr'),
    h('h3', {}, 'Sauvegarde & transfert (iCloud)'),
    h('p', { class: 'muted' }, 'Exporte un fichier .atlas chiffré, puis « Enregistrer dans Fichiers » → iCloud Drive. Sur un autre appareil : Importer → choisis le fichier dans iCloud Drive. Le mot de passe chiffre le fichier (AES-GCM) — même Apple ne peut pas le lire.'),
    h('div', { class: 'field' }, h('label', {}, 'Mot de passe de chiffrement'), passBackupIn),
    h('label', { class: 'switch', style: 'margin-bottom:14px' },
      h('input', { type: 'checkbox', checked: !!s.rememberBackupPass,
        onchange: (e) => store.updateSettings({ rememberBackupPass: e.target.checked, backupPass: e.target.checked ? passBackupIn.value : '' }) }),
      h('span', {}, 'Mémoriser le mot de passe sur cet appareil')),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn--primary', onclick: doExport }, '⬇️ Exporter (chiffré)'),
      h('label', { class: 'btn btn--ghost' }, '⬆️ Importer',
        h('input', {
          // PAS de `accept` : iOS grise les .atlas (extension inconnue). On
          // accepte tout et on valide à la lecture (format vérifié dans importBackupFile).
          type: 'file', class: 'visually-hidden',
          onchange: async (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) await importBackupFile(f, passBackupIn.value);
            e.target.value = '';
          },
        }))),
    autosave.isSupported()
      ? autoSaveBlock()
      : h('p', { class: 'muted', style: 'margin-top:10px' }, 'Sauvegarde automatique : disponible sur Mac/PC (Chrome/Edge). Sur iPhone/iPad, l’export reste manuel (limitation Apple).'),

    h('hr'),
    h('details', { class: 'adv' },
      h('summary', {}, 'Synchro cloud temps réel (avancé, optionnel)'),
      h('p', { class: 'muted' }, 'Par compte via Supabase (e-mail + mot de passe, aucune URL à configurer). Projet Supabase gratuit à créer une fois — voir README → Sync. Données hébergées chez Supabase (pas de bout-en-bout) ; le mot de passe n’est pas stocké, la session reste mémorisée.'),
      h('div', { class: 'field' }, h('label', {}, 'URL du projet Supabase'), urlIn),
      h('div', { class: 'field' }, h('label', {}, 'Clé anon (publique)'), keyIn),
      h('div', { class: 'field' }, h('label', {}, 'E-mail'), emailIn),
      h('div', { class: 'field' }, h('label', {}, 'Mot de passe (créé au 1er usage)'), passIn),
      h('div', { class: 'form-actions' },
        h('button', {
          class: 'btn btn--ghost',
          onclick: () => { store.updateSettings({ supabaseUrl: urlIn.value.trim(), supabaseAnonKey: keyIn.value.trim(), syncEmail: emailIn.value.trim() }); toast('Réglages sync enregistrés', 'ok'); },
        }, 'Enregistrer'),
        h('button', { class: 'btn btn--primary', onclick: () => syncNow(passIn.value) }, '🔄 Synchroniser')),
      s.lastSync ? h('p', { class: 'muted' }, 'Dernière synchro : ' + new Date(s.lastSync).toLocaleString('fr-FR')) : null),

    h('hr'),
    h('h3', { class: 'danger-title' }, 'Zone sensible'),
    h('button', {
      class: 'btn btn--danger',
      onclick: async () => {
        if (confirm('Tout effacer (fiches + photos) sur CET appareil ? Action irréversible.')) {
          const db = await import('./db.js');
          await db.clearAll();
          await store.refreshFromDb();
          toast('Toutes les données locales ont été effacées', 'info');
          store.closePanel();
        }
      },
    }, '🗑️ Tout effacer (cet appareil)')));
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function kpi(label, value, sub) {
  return h('div', { class: 'kpi' },
    h('div', { class: 'kpi__val' }, value),
    h('div', { class: 'kpi__lbl' }, label),
    sub ? h('div', { class: 'kpi__sub' }, sub) : null);
}

function dashCard(title, body) {
  return h('section', { class: 'dash-card' },
    h('h3', {}, title),
    h('div', { class: 'dash-card__body' }, body));
}

function timelineSection(people) {
  const items = people.filter((p) => p.date)
    .map((p) => {
      const start = new Date(p.date + 'T00:00:00');
      const end = p.endDate ? new Date(p.endDate + 'T00:00:00') : new Date();
      return { p, start, end: end < start ? start : end, ongoing: !p.endDate };
    })
    .filter((x) => !isNaN(x.start))
    .sort((a, b) => a.start - b.start);
  if (!items.length) return h('div', { class: 'muted' }, 'Renseigne des dates de rencontre pour voir la frise.');

  let min = items[0].start, max = items[0].end;
  for (const x of items) { if (x.start < min) min = x.start; if (x.end > max) max = x.end; }
  min = new Date(min.getFullYear(), min.getMonth() - 3, 1);
  max = new Date(max.getFullYear(), max.getMonth() + 3, 1);
  const span = Math.max(1, max - min);
  const pct = (d) => ((d - min) / span) * 100;

  const axis = h('div', { class: 'tl-axis' });
  for (let y = min.getFullYear(); y <= max.getFullYear(); y++) {
    const x = pct(new Date(y, 0, 1));
    if (x < 0 || x > 100) continue;
    axis.appendChild(h('span', { class: 'tl-tick', style: `left:${x}%` }, String(y)));
  }
  const rows = h('div', { class: 'tl-rows' });
  for (const x of items) {
    const left = pct(x.start), width = Math.max(1.2, pct(x.end) - left);
    rows.appendChild(h('div', { class: 'tl-row', onclick: () => store.openDetail(x.p.id) },
      h('div', { class: 'tl-label' }, avatar(x.p, 'avatar--xs'), h('span', {}, esc(x.p.name || '—'))),
      h('div', { class: 'tl-track' },
        h('div', {
          class: 'tl-bar' + (x.ongoing ? ' tl-bar--ongoing' : ''),
          style: `left:${left}%; width:${width}%; --c:${safeColor(x.p.color)}`,
          title: fmtDate(x.p.date) + (x.p.endDate ? ' → ' + fmtDate(x.p.endDate) : ' → en cours'),
        }))));
  }
  return h('div', { class: 'timeline' }, h('div', { class: 'tl-head' }, axis), rows);
}

function distBlock(title, entries) {
  const max = entries[0][1] || 1;
  return h('div', { class: 'dist' },
    h('h4', {}, esc(title)),
    ...entries.slice(0, 8).map(([val, n]) => h('div', { class: 'dist-row' },
      h('span', { class: 'dist-lbl' }, esc(String(val))),
      h('div', { class: 'dist-bar' }, h('div', { class: 'dist-bar__fill', style: `width:${(n / max) * 100}%` })),
      h('span', { class: 'dist-n' }, String(n)))));
}

function paramsSection(people) {
  const blocks = [];
  const statuses = tally(people.map((p) => p.status).filter(Boolean));
  if (statuses.length) blocks.push(distBlock('Statut', statuses));
  for (const key of store.knownParamKeys()) {
    const vals = tally(people.flatMap((p) => (p.fields || []).filter((f) => f.key === key && f.value).map((f) => f.value)));
    if (vals.length) blocks.push(distBlock(key, vals));
  }
  const tags = tally(people.flatMap((p) => p.tags || []));
  if (tags.length) blocks.push(distBlock('Tags', tags));
  if (!blocks.length) return h('div', { class: 'muted' }, 'Ajoute des statuts, paramètres ou tags pour les voir classés ici.');
  return h('div', { class: 'dist-grid' }, ...blocks);
}

async function countryStats(people) {
  const map = new Map();
  for (const p of people) {
    const o = p.origin;
    if (!o) continue;
    const name = await countryNameAt(Number(o.lng), Number(o.lat));
    const key = name || 'Inconnu';
    const e = map.get(key) || { count: 0, sum: 0, rated: 0 };
    e.count++;
    if (p.rating != null) { e.sum += p.rating; e.rated++; }
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([name, e]) => ({ name, count: e.count, avg: e.rated ? e.sum / e.rated : null }))
    .sort((a, b) => b.count - a.count || (b.avg || 0) - (a.avg || 0));
}

function countryStatsNode(rows) {
  if (!rows.length) return h('div', { class: 'muted' }, 'Renseigne des origines pour le classement par pays.');
  const maxC = rows[0].count || 1;
  return h('div', { class: 'ctry-list' },
    ...rows.map((r) => h('div', { class: 'ctry-row' },
      h('span', { class: 'ctry-name' }, esc(r.name)),
      h('div', { class: 'ctry-bar' }, h('div', { class: 'ctry-bar__fill', style: `width:${(r.count / maxC) * 100}%` })),
      h('span', { class: 'ctry-meta' }, String(r.count),
        r.avg != null ? h('span', { class: 'ctry-avg' }, ` · ${r.avg.toFixed(1)}/10`) : null))));
}

export function renderDashboard(viewEl) {
  const people = store.getState().people;
  viewEl.innerHTML = '';
  if (!people.length) {
    viewEl.appendChild(h('div', { class: 'empty' },
      h('div', { class: 'empty__icon' }, '📊'),
      h('h2', {}, 'Dashboard'),
      h('p', {}, 'Ajoute des fiches pour voir tes statistiques, ta frise et le classement par pays.')));
    return;
  }
  const rated = people.filter((p) => p.rating != null);
  const avg = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : null;
  const ended = people.filter((p) => p.endDate).length;
  const paysKpi = h('span', {}, '…');

  const wrap = h('div', { class: 'dash' },
    h('div', { class: 'kpis' },
      kpi('Fiches', String(people.length)),
      kpi('Note moy.', avg != null ? avg.toFixed(1) : '–', avg != null ? '/10' : null),
      kpi('Terminées', String(ended), `${people.length - ended} en cours`),
      kpi('Pays', paysKpi)),
    dashCard('Frise chronologique', timelineSection(people)),
    dashCard('Notes & classement par pays', h('div', { class: 'muted' }, 'Calcul…')),
    dashCard('Paramètres', paramsSection(people)));
  viewEl.appendChild(wrap);

  const countryCard = wrap.querySelectorAll('.dash-card')[1];
  countryStats(people).then((rows) => {
    const body = countryCard.querySelector('.dash-card__body');
    body.innerHTML = '';
    body.appendChild(countryStatsNode(rows));
    paysKpi.textContent = String(rows.filter((r) => r.name !== 'Inconnu').length);
  });
}
