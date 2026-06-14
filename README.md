# 🌍 Atlas

Un **globe 3D** sur lequel tu logues des fiches souvenirs géolocalisées : photo,
lieu de rencontre, origine, autres lieux (arcs animés façon Polarsteps), note /10,
statut, tags, paramètres personnalisés et notes libres.

App **web installable** (PWA) — fonctionne sur **PC, Mac, iPad, iPhone**, en ligne
comme **hors-ligne**. Tes données restent **sur ton appareil** (IndexedDB) ; rien
n'est envoyé sur Internet sauf si tu actives la synchro.

---

## Lancer l'app

### Depuis le hub perso
`python hub.py` → clique sur la carte **Atlas**.

### En autonome (dev)
```bash
python -m http.server 8799 --directory atlas_app
# puis ouvre http://localhost:8799/
```
> ⚠️ Ne pas ouvrir le fichier en `file://` : les modules ES et le service worker
> nécessitent `http://` (ou `https://`).

---

## Installer sur l'écran d'accueil

- **iPhone / iPad (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Mac / PC (Chrome/Edge)** : icône d'installation dans la barre d'adresse, ou
  menu → « Installer Atlas ».
- **Mac (Safari)** : Fichier → « Ajouter au Dock ».

Une fois installée, elle s'ouvre en plein écran comme une vraie app et marche
hors-ligne.

---

## Utilisation

1. **+** (en haut à droite) → nouvelle fiche.
2. Photo, prénom/surnom, statut, note /10, **date de rencontre**, **date de fin**,
   **écart d'âge** (+ plus âgé·e / − plus jeune), tags.
3. **Origine** et **Lieu de rencontre** : tape une ville → choisis dans la liste
   (géocodage OpenStreetMap). Hors-ligne ? Utilise « Coordonnées manuelles ».
4. **Autres lieux** : ajoute des lieux → des **arcs** se tracent sur le globe.
5. **Paramètres personnalisés** : champs libres clé/valeur (taille, langue, etc.).
   Clique **★** sur un paramètre pour le rendre **réutilisable** : il sera proposé en
   un clic sur toutes tes prochaines fiches.
6. **Notes & souvenirs** : texte libre.
7. Bascule **Globe 🌍 / Liste ▦ / Dashboard 📊** en haut. Sur le globe, clique un
   **pin photo** pour rouvrir la fiche. Recherche par nom/lieu/tag.

**📊 Dashboard** : KPIs, **frise chronologique** (chaque personne de sa date de
rencontre à sa date de fin), **notes & classement par pays**, et distribution de tes
**paramètres**. Réglages → « Colorier les pays d'origine » teinte sur le globe les pays
d'où viennent tes rencontres.

Réglages (⚙️) : thème clair/sombre, texture de la Terre, rotation, arcs, **colorisation
des pays**, sauvegarde (+ auto Mac/PC), sync, effacement.

---

## Transférer entre appareils

### Recommandé — fichier `.atlas` chiffré via iCloud Drive
Le plus privé : rien ne quitte ton écosystème, et le fichier est chiffré (AES-GCM) —
même Apple ne peut pas le lire.
1. ⚙️ Réglages → **Sauvegarde & transfert** : choisis un **mot de passe de chiffrement**
   (option « mémoriser sur cet appareil » si tu veux éviter de le retaper).
2. **Exporter (chiffré)** → « Enregistrer dans Fichiers » → **iCloud Drive**.
3. Sur l'autre appareil (même app installée) : Réglages → **Importer** → choisis le
   fichier dans iCloud Drive → entre le mot de passe → **fusionner** ou **remplacer**.

> Refais un export après des ajouts importants pour garder iCloud à jour. Le fichier
> marche aussi par AirDrop ou mail si tu préfères.

**Sauvegarde automatique (Mac / PC uniquement)** : sur ordinateur avec **Chrome/Edge**,
⚙️ Réglages → **Sauvegarde automatique → 🔗 Lier un fichier** : choisis (ou crée) un
fichier dans **iCloud Drive**. Atlas y réécrit ensuite **tout seul, à chaque
modification** (chiffré avec ton mot de passe). iCloud le synchronise vers tes autres
appareils ; tu n'as plus qu'à **Importer** dessus quand tu veux. Sur **iPhone/iPad**,
Safari interdit l'écriture auto → l'export reste manuel (2 taps).
> Après un redémarrage du navigateur, clique **Réactiver** une fois (le navigateur
> redemande l'autorisation d'écrire dans le fichier — sécurité standard).

### Option avancée — synchro Supabase (multi-appareils, e-mail + mot de passe)

Setup en ~5 min, **une seule fois**. Aucune URL de redirection à configurer.

1. Crée un projet gratuit sur https://supabase.com (note la région).
2. **SQL Editor → New query** → colle le contenu de [`supabase_setup.sql`](supabase_setup.sql) → **Run**.
3. **Authentication → Providers → Email** : active **Email**, et **désactive
   « Confirm email »** (sinon il faut valider un e-mail avant la 1re synchro).
4. **Project Settings → API** : copie l'**URL du projet** et la **clé anon (public)**.
5. Dans Atlas → ⚙️ Réglages → **Synchro** : colle l'URL + la clé anon, choisis un
   **e-mail** et un **mot de passe** (le compte se crée tout seul au 1er usage) →
   **Enregistrer** → **Synchroniser**.
6. Sur tes **autres appareils** : mêmes URL + clé anon + **même e-mail/mot de passe**
   → Synchroniser. Tes fiches apparaissent.

> Le mot de passe n'est **pas stocké** par l'app (la session reste mémorisée ensuite).
> Données chiffrées en transit (HTTPS), isolées par compte (RLS `auth.uid() = user_id`).
> Limite v1 : les **suppressions** ne se propagent pas encore entre appareils.

---

## Confidentialité

- Par défaut, **100 % local** (IndexedDB de ton navigateur). Aucune donnée ne sort.
- Le **géocodage** envoie seulement le *nom de ville tapé* à OpenStreetMap (jamais
  tes fiches). Tu peux l'éviter avec les coordonnées manuelles.
- L'export peut être **chiffré par mot de passe**.
- « Tout effacer » (Réglages) supprime fiches + photos de cet appareil.

---

## Tech

PWA vanilla (pas de build) · [globe.gl](https://globe.gl) / three.js · IndexedDB ·
Nominatim (OSM) · Supabase (optionnel). Détails d'architecture → `context.md`.
Régénérer les icônes : `python make_icons.py`.
