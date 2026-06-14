// form.js — formulaire d'ajout / édition d'une fiche.

import * as store from './store.js';
import * as db from './db.js';
import { h, esc, toast, resizeImage, debounce, ALL_COLORS, uid } from './util.js';
import { searchPlaces, parseLatLng } from './geocode.js';

/**
 * Champ « lieu » réutilisable : recherche géocodée + saisie manuelle.
 * onChange reçoit l'objet {label, lat, lng} ou null.
 */
function locationField(labelText, initial, onChange) {
  let current = initial ? { ...initial } : null;
  const chip = h('div', { class: 'locfield__chip' });
  const input = h('input', {
    type: 'search', class: 'locfield__input', placeholder: 'Ville, pays, lieu…',
    autocomplete: 'off', 'aria-label': labelText + ' — rechercher un lieu',
  });
  const results = h('div', { class: 'locfield__results' });

  function renderChip() {
    chip.innerHTML = '';
    if (current) {
      chip.appendChild(h('span', { class: 'locfield__pin' },
        h('span', { class: 'dot' }), current.label || `${current.lat.toFixed(2)}, ${current.lng.toFixed(2)}`));
      chip.appendChild(h('button', {
        type: 'button', class: 'locfield__clear', title: 'Retirer',
        onclick: () => { current = null; onChange(null); renderChip(); },
      }, '✕'));
    }
  }

  let ctrl = null;
  const doSearch = debounce(async (q) => {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    results.innerHTML = '<div class="locfield__hint">Recherche…</div>';
    try {
      const list = await searchPlaces(q, ctrl.signal);
      results.innerHTML = '';
      if (!list.length) {
        results.appendChild(h('div', { class: 'locfield__hint' },
          'Aucun résultat (hors-ligne ? utilise les coordonnées manuelles).'));
        return;
      }
      for (const r of list) {
        results.appendChild(h('button', {
          type: 'button', class: 'locfield__result',
          onclick: () => {
            current = { label: r.short || r.label, lat: r.lat, lng: r.lng };
            onChange(current);
            renderChip();
            results.innerHTML = '';
            input.value = '';
          },
        }, h('span', { class: 'locfield__rlabel' }, r.short || r.label)));
      }
    } catch (e) {
      if (e.name !== 'AbortError') results.innerHTML = '';
    }
  }, 550);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    doSearch(q);
  });

  const latIn = h('input', { type: 'number', step: 'any', placeholder: 'lat', class: 'mini' });
  const lngIn = h('input', { type: 'number', step: 'any', placeholder: 'lng', class: 'mini' });
  const manual = h('details', { class: 'locfield__manual' },
    h('summary', {}, 'Coordonnées manuelles'),
    h('div', { class: 'locfield__manualrow' },
      latIn, lngIn,
      h('button', {
        type: 'button', class: 'btn btn--ghost mini',
        onclick: () => {
          const c = parseLatLng(latIn.value, lngIn.value);
          if (!c) { toast('Coordonnées invalides', 'err'); return; }
          current = { label: input.value.trim() || `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`, ...c };
          onChange(current);
          renderChip();
        },
      }, 'Définir')));

  renderChip();
  return h('div', { class: 'field locfield' },
    h('label', {}, labelText),
    chip, input, results, manual);
}

export function renderForm(host) {
  const editing = store.getState().editingId;
  const base = editing ? store.personById(editing) : null;
  const draft = base ? structuredClone(base) : store.newPerson();
  const originalPhotoId = draft.photoId;
  const originalThumbId = draft.thumbId;
  let pendingPhotoBlob = undefined; // undefined = inchangé, null = retiré, Blob = nouveau
  let pendingThumbBlob = undefined; // miniature, même cycle de vie que pendingPhotoBlob

  host.innerHTML = '';

  // ── Photo ──
  const photoPreview = h('div', { class: 'photo-preview' });
  let previewUrl = null;
  function renderPhoto() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    photoPreview.innerHTML = '';
    let url = null;
    if (pendingPhotoBlob instanceof Blob) { previewUrl = URL.createObjectURL(pendingPhotoBlob); url = previewUrl; }
    else if (pendingPhotoBlob === undefined && draft.photoId) url = store.photoUrl(draft.photoId);
    if (url) {
      photoPreview.appendChild(h('img', { src: url, alt: '' }));
      photoPreview.appendChild(h('button', {
        type: 'button', class: 'photo-remove', title: 'Retirer la photo',
        onclick: () => { pendingPhotoBlob = null; pendingThumbBlob = null; renderPhoto(); },
      }, '✕'));
    } else {
      photoPreview.appendChild(h('div', { class: 'photo-placeholder' }, '📷'));
    }
  }
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photoInput',
    onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        pendingPhotoBlob = await resizeImage(f, 1600, 0.85); // pleine résolution (visionneuse)
        pendingThumbBlob = await resizeImage(f, 256, 0.8);    // miniature (globe/cartes)
        renderPhoto();
      } catch (err) { toast('Image illisible', 'err'); }
    },
  });
  renderPhoto();

  // ── Nom ──
  const nameInput = h('input', { type: 'text', value: draft.name || '', placeholder: 'Prénom / surnom', maxlength: '80', 'aria-label': 'Prénom ou surnom' });

  // ── Statut ──
  const statusSelect = h('select', { 'aria-label': 'Statut' },
    h('option', { value: '' }, '— Statut —'),
    ...store.STATUS_OPTIONS.map((s) => h('option', { value: s, selected: draft.status === s }, s)));
  // permettre un statut libre déjà présent mais hors liste
  if (draft.status && !store.STATUS_OPTIONS.includes(draft.status)) {
    statusSelect.appendChild(h('option', { value: draft.status, selected: true }, draft.status));
  }

  // ── Note /10 ──
  const ratingVal = h('span', { class: 'rating-val' }, draft.rating != null ? String(draft.rating) : '–');
  const ratingInput = h('input', {
    type: 'range', min: '0', max: '10', step: '1', 'aria-label': 'Note sur 10',
    value: draft.rating != null ? String(draft.rating) : '0',
    oninput: (e) => { ratingVal.textContent = e.target.value; },
  });
  const ratingClear = h('button', {
    type: 'button', class: 'btn btn--ghost mini',
    onclick: () => { ratingInput.value = '0'; ratingVal.textContent = '–'; ratingInput.dataset.cleared = '1'; },
  }, 'Aucune');
  ratingInput.addEventListener('input', () => { delete ratingInput.dataset.cleared; });
  // Une fiche jamais notée doit rester sans note (null), pas 0/10.
  if (draft.rating == null) ratingInput.dataset.cleared = '1';

  // ── Dates & écart d'âge ──
  const dateInput = h('input', { type: 'date', value: draft.date || '', 'aria-label': 'Date de rencontre' });
  const endDateInput = h('input', { type: 'date', value: draft.endDate || '', 'aria-label': 'Date de fin' });
  const ageDiffInput = h('input', {
    type: 'number', step: '1', inputmode: 'numeric',
    value: draft.ageDiff != null ? String(draft.ageDiff) : '',
    placeholder: 'ex : +3 ou −5', 'aria-label': 'Écart d’âge en années',
  });

  // ── Tags ──
  const tags = [...(draft.tags || [])];
  const tagsWrap = h('div', { class: 'chips' });
  const tagInput = h('input', { type: 'text', placeholder: 'Ajouter un tag + Entrée', class: 'tag-input' });
  function renderTags() {
    tagsWrap.querySelectorAll('.chip').forEach((c) => c.remove());
    tags.forEach((t, i) => {
      tagsWrap.insertBefore(
        h('span', { class: 'chip' }, t, h('button', {
          type: 'button', onclick: () => { tags.splice(i, 1); renderTags(); },
        }, '✕')),
        tagInput);
    });
  }
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = tagInput.value.trim().replace(/,$/, '');
      if (v && !tags.includes(v)) { tags.push(v); tagInput.value = ''; renderTags(); }
    } else if (e.key === 'Backspace' && !tagInput.value && tags.length) {
      tags.pop(); renderTags();
    }
  });
  tagsWrap.appendChild(tagInput);
  renderTags();

  // ── Lieux ──
  const originField = locationField('Origine / nationalité', draft.origin, (v) => { draft.origin = v; });
  const metField = locationField('Lieu de rencontre', draft.metPlace, (v) => { draft.metPlace = v; });

  // ── Lieux additionnels (pour les arcs / voyages) ──
  const places = (draft.places || []).map((p) => ({ ...p, _id: uid() }));
  const placesWrap = h('div', { class: 'subfields' });
  function renderPlaces() {
    placesWrap.innerHTML = '';
    places.forEach((pl) => {
      const noteIn = h('input', {
        type: 'text', value: pl.note || '', placeholder: 'Note (optionnel)',
        oninput: (e) => { pl.note = e.target.value; },
      });
      const lf = locationField('Lieu', pl.label ? pl : null, (v) => {
        if (v) { pl.label = v.label; pl.lat = v.lat; pl.lng = v.lng; }
        else { pl.label = ''; pl.lat = undefined; pl.lng = undefined; }
      });
      placesWrap.appendChild(h('div', { class: 'subfield' },
        lf, noteIn,
        h('button', {
          type: 'button', class: 'btn btn--ghost mini',
          onclick: () => {
            const i = places.indexOf(pl);
            if (i >= 0) places.splice(i, 1);
            renderPlaces();
          },
        }, 'Retirer ce lieu')));
    });
  }
  renderPlaces();
  const addPlaceBtn = h('button', {
    type: 'button', class: 'btn btn--ghost mini',
    onclick: () => { places.push({ _id: uid(), label: '', note: '' }); renderPlaces(); },
  }, '+ Ajouter un lieu');

  // ── Paramètres personnalisés (clé/valeur) + réutilisables ──
  const fields = (draft.fields || []).map((f) => ({ ...f }));
  const fieldsWrap = h('div', { class: 'subfields' });
  const paramDL = h('datalist', { id: 'paramKeysDL' },
    ...store.knownParamKeys().map((k) => h('option', { value: k })));
  const quickWrap = h('div', { class: 'chips quick-params' });

  function renderQuick() {
    quickWrap.innerHTML = '';
    const used = new Set(fields.map((f) => (f.key || '').trim()).filter(Boolean));
    const avail = store.knownParamKeys().filter((k) => !used.has(k));
    if (!avail.length) {
      quickWrap.appendChild(h('span', { class: 'hint' }, 'Astuce : clique l’étoile (☆ → ★) d’un paramètre pour le garder « par défaut » sur toutes les fiches.'));
      return;
    }
    avail.forEach((k) => quickWrap.appendChild(h('button', {
      type: 'button', class: 'chip chip--add',
      onclick: () => { fields.push({ key: k, value: '' }); renderFields(); renderQuick(); },
    }, '+ ' + k)));
  }
  function renderFields() {
    fieldsWrap.innerHTML = '';
    fields.forEach((f) => {
      const star = h('button', { type: 'button', class: 'btn btn--ghost mini star-btn' });
      const paintStar = () => {
        const on = store.isDefaultParam(f.key);
        star.textContent = on ? '★' : '☆';
        star.classList.toggle('is-on', on);
        star.title = on
          ? 'Paramètre par défaut (réutilisable) — clique pour retirer'
          : 'Rendre ce paramètre « par défaut » (réutilisable sur toutes les fiches)';
      };
      star.addEventListener('click', async () => {
        const k = (f.key || '').trim();
        if (!k) { toast('Donne d’abord un nom au paramètre', 'err'); return; }
        if (store.isDefaultParam(k)) {
          await store.demoteParam(k);
          toast('« ' + k + ' » retiré des paramètres par défaut', 'info');
        } else {
          await store.promoteParam(k);
          toast('« ' + k + ' » ajouté aux paramètres par défaut', 'ok');
        }
        paintStar();
        renderQuick();
      });
      const keyInput = h('input', {
        type: 'text', list: 'paramKeysDL', value: f.key || '', placeholder: 'Paramètre (ex: taille)',
        oninput: (e) => { f.key = e.target.value; paintStar(); },
      });
      paintStar();
      fieldsWrap.appendChild(h('div', { class: 'kvrow' },
        keyInput,
        h('input', { type: 'text', value: f.value || '', placeholder: 'Valeur', oninput: (e) => { f.value = e.target.value; } }),
        star,
        h('button', {
          type: 'button', class: 'btn btn--ghost mini',
          onclick: () => { const i = fields.indexOf(f); if (i >= 0) fields.splice(i, 1); renderFields(); renderQuick(); },
        }, '✕')));
    });
  }
  renderFields();
  renderQuick();
  const addFieldBtn = h('button', {
    type: 'button', class: 'btn btn--ghost mini',
    onclick: () => { fields.push({ key: '', value: '' }); renderFields(); },
  }, '+ Ajouter un paramètre');

  // ── Notes ──
  const notesInput = h('textarea', { rows: '5', 'aria-label': 'Notes et souvenirs', placeholder: 'Souvenirs, anecdotes, comment vous vous êtes rencontrés…' });
  notesInput.value = draft.notes || '';

  // ── Couleur (point/arc sur le globe) ──
  const colorWrap = h('div', { class: 'colors' });
  ALL_COLORS.forEach((c) => {
    colorWrap.appendChild(h('button', {
      type: 'button', class: 'swatch' + (draft.color === c ? ' is-sel' : ''),
      style: `--c:${c}`, title: c, 'aria-label': 'Couleur ' + c,
      onclick: (e) => {
        draft.color = c;
        colorWrap.querySelectorAll('.swatch').forEach((s) => s.classList.remove('is-sel'));
        e.currentTarget.classList.add('is-sel');
      },
    }));
  });

  // ── Boutons ──
  const saveBtn = h('button', { type: 'submit', class: 'btn btn--primary' }, editing ? 'Enregistrer' : 'Créer la fiche');
  const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => store.closePanel() }, 'Annuler');
  const deleteBtn = editing
    ? h('button', {
        type: 'button', class: 'btn btn--danger',
        onclick: async () => {
          if (confirm(`Supprimer la fiche « ${draft.name || 'sans nom'} » ?`)) {
            await store.removePerson(draft.id);
            toast('Fiche supprimée', 'info');
          }
        },
      }, 'Supprimer')
    : null;

  const form = h('form', {
    class: 'fiche-form',
    onsubmit: async (e) => {
      e.preventDefault();
      draft.name = nameInput.value.trim();
      if (!draft.name) { toast('Donne au moins un prénom', 'err'); nameInput.focus(); return; }
      draft.status = statusSelect.value;
      draft.rating = ratingInput.dataset.cleared ? null : parseInt(ratingInput.value, 10);
      draft.date = dateInput.value || '';
      draft.endDate = endDateInput.value || '';
      const ad = ageDiffInput.value.trim();
      draft.ageDiff = (ad === '' || isNaN(parseInt(ad, 10))) ? null : parseInt(ad, 10);
      draft.tags = tags;
      draft.notes = notesInput.value;
      const valid = (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
      const dropped = places.filter((p) => !valid(p) && ((p.note || '').trim() || (p.label || '').trim()));
      if (dropped.length) toast(`${dropped.length} lieu(x) ignoré(s) : coordonnées manquantes`, 'err');
      draft.places = places.filter(valid)
        .map((p) => ({ label: p.label || '', lat: Number(p.lat), lng: Number(p.lng), note: p.note || '' }));
      draft.fields = fields.filter((f) => (f.key || '').trim() || (f.value || '').trim());

      // Photo
      try {
        if (pendingPhotoBlob === null) {
          if (originalPhotoId) await db.deletePhoto(originalPhotoId);
          if (originalThumbId) await db.deletePhoto(originalThumbId);
          draft.photoId = null;
          draft.thumbId = null;
        } else if (pendingPhotoBlob instanceof Blob) {
          const newId = await db.putPhoto(pendingPhotoBlob, 'image/jpeg');
          const newThumbId = pendingThumbBlob instanceof Blob
            ? await db.putPhoto(pendingThumbBlob, 'image/jpeg') : null;
          if (originalPhotoId && originalPhotoId !== newId) await db.deletePhoto(originalPhotoId);
          if (originalThumbId && originalThumbId !== newThumbId) await db.deletePhoto(originalThumbId);
          draft.photoId = newId;
          draft.thumbId = newThumbId;
        }
      } catch (err) { toast('Erreur en enregistrant la photo', 'err'); }

      await store.savePerson(draft);
      toast(editing ? 'Fiche mise à jour' : 'Fiche créée', 'ok');
      store.openDetail(draft.id);
    },
  },
    h('div', { class: 'form-photo-row' },
      h('label', { for: 'photoInput', class: 'photo-label' }, photoPreview, fileInput),
      h('div', { class: 'form-photo-fields' },
        h('div', { class: 'field' }, h('label', {}, 'Prénom / surnom'), nameInput),
        h('div', { class: 'field' }, h('label', {}, 'Statut'), statusSelect))),

    h('div', { class: 'field' },
      h('label', {}, 'Note ', ratingVal, ' /10'),
      h('div', { class: 'rating-row' }, ratingInput, ratingClear)),

    h('div', { class: 'field' }, h('label', {}, 'Date de rencontre'), dateInput),
    h('div', { class: 'field' }, h('label', {}, 'Date de fin'), endDateInput),
    h('div', { class: 'field' },
      h('label', {}, 'Écart d’âge ', h('span', { class: 'hint' }, '(+ plus âgé·e, − plus jeune)')),
      ageDiffInput),
    h('div', { class: 'field' }, h('label', {}, 'Tags'), tagsWrap),

    originField,
    metField,
    h('p', { class: 'muted', style: 'margin:-8px 0 14px' },
      'La recherche de lieu interroge OpenStreetMap (Nominatim). Tu peux aussi saisir les coordonnées à la main.'),

    h('div', { class: 'field' },
      h('label', {}, 'Autres lieux (voyages, arcs sur le globe)'),
      placesWrap, addPlaceBtn),

    h('div', { class: 'field' },
      h('label', {}, 'Paramètres personnalisés'),
      quickWrap, fieldsWrap, paramDL, addFieldBtn),

    h('div', { class: 'field' }, h('label', {}, 'Notes & souvenirs'), notesInput),
    h('div', { class: 'field' }, h('label', {}, 'Couleur sur le globe'), colorWrap),

    h('div', { class: 'form-actions' }, saveBtn, cancelBtn, deleteBtn));

  host.appendChild(form);
  nameInput.focus();
}
