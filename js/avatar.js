// avatar.js — générateur d'avatar illustré (SVG paramétrique). Aucune dépendance.
// Utilisé comme image de fiche quand il n'y a pas de photo. 100 % local.

export const SKINS = ['#FBE0C8', '#F3CBA6', '#E6B98F', '#CD9A6B', '#A56A43', '#7A4B2A', '#5A3620'];
export const HAIRS = ['#1C140D', '#3B2417', '#5C3A21', '#8B5A2B', '#B07A3E', '#D6B370', '#EAD6A0', '#B5B5B5', '#ECECEC', '#C0392B', '#7A3FA0', '#6C5CE7'];
export const EYECOLORS = ['#5B3A1E', '#6B4F2A', '#2E7D32', '#1565C0', '#4E7894', '#6B6B6B'];
export const HAIRSTYLES = [['court', 'Court'], ['mi-long', 'Mi-long'], ['long', 'Long'], ['boucle', 'Bouclé'], ['chignon', 'Chignon'], ['queue', 'Queue de cheval'], ['chauve', 'Chauve']];
export const FACIALS = [['aucune', 'Aucune'], ['barbe', 'Barbe'], ['moustache', 'Moustache'], ['bouc', 'Bouc']];
export const GENDERS = [['f', 'Femme'], ['h', 'Homme'], ['x', 'Autre']];

export function defaultAvatar() {
  return { gender: 'f', skin: SKINS[1], hair: HAIRS[2], hairStyle: 'mi-long', eyes: EYECOLORS[0], facial: 'aucune', glasses: false };
}

function shade(hex, amt) {
  const c = (hex || '#888888').replace('#', '');
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const to = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round(r + (to - r) * p); g = Math.round(g + (to - g) * p); b = Math.round(b + (to - b) * p);
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function hairPaths(style, hair) {
  const dark = shade(hair, -0.32);
  // Calotte couvrant le crâne, de l'arrière du sommet (y≈15) jusqu'à la ligne de
  // cheveux (hairlineY) et descendant sur les côtés jusqu'à sideY.
  const cap = (hairlineY, sideY) => {
    const mid = (sideY + hairlineY) / 2;
    return `<path d="M24,${sideY} C22,16 24,15 50,15 C76,15 78,16 76,${sideY} C76,${mid} 72,${hairlineY} 50,${hairlineY} C28,${hairlineY} 24,${mid} 24,${sideY} Z" fill="${hair}"/>`;
  };
  let back = '', front = '';
  switch (style) {
    case 'chauve':
      break;
    case 'court':
      front = cap(33, 47); break;
    case 'mi-long':
      back = `<path d="M22,46 C20,16 80,16 78,46 L78,62 L72,62 L72,34 C66,28 58,26 50,26 C42,26 34,28 28,34 L28,62 L22,62 Z" fill="${dark}"/>`;
      front = cap(33, 56); break;
    case 'long':
      back = `<path d="M20,44 C18,14 82,14 80,44 L80,92 L70,92 L70,32 C64,26 58,24 50,24 C42,24 36,26 30,32 L30,92 L20,92 Z" fill="${dark}"/>`;
      front = cap(33, 52); break;
    case 'queue':
      back = `<path d="M68,28 C86,32 90,58 76,76 C88,56 84,38 68,34 Z" fill="${dark}"/>`;
      front = cap(33, 47); break;
    case 'chignon':
      front = `<circle cx="50" cy="16" r="9" fill="${hair}"/>` + cap(34, 44); break;
    case 'boucle': {
      let curls = '';
      for (const [x, y] of [[30, 28], [40, 22], [50, 20], [60, 22], [70, 28], [26, 38], [74, 38], [35, 24], [65, 24]]) {
        curls += `<circle cx="${x}" cy="${y}" r="9.5" fill="${hair}"/>`;
      }
      front = curls; break;
    }
    default:
      front = cap(33, 47);
  }
  return { back, front };
}

function facialPaths(facial, hair) {
  switch (facial) {
    case 'barbe':
      return `<path d="M30,50 C30,72 40,80 50,80 C60,80 70,72 70,50 C70,62 62,66 50,66 C38,66 30,62 30,50 Z" fill="${hair}" opacity="0.95"/>`;
    case 'moustache':
      return `<path d="M40,56 C44,54 48,55 50,57 C52,55 56,54 60,56 C56,60 52,59 50,58 C48,59 44,60 40,56 Z" fill="${hair}"/>`;
    case 'bouc':
      return `<path d="M40,56 C44,54 56,54 60,56 C58,59 52,58 50,57 C48,58 42,59 40,56 Z" fill="${hair}"/><path d="M44,62 C44,70 56,70 56,62 C54,66 46,66 44,62 Z" fill="${hair}"/>`;
    default:
      return '';
  }
}

export function generateAvatarSVG(cfg) {
  const c = { ...defaultAvatar(), ...(cfg || {}) };
  const skin = c.skin, skinD = shade(skin, -0.18), skinL = shade(skin, 0.18);
  const hair = c.hair, browC = shade(hair, -0.2);
  const eye = c.eyes;
  const bgTop = '#4a4766', bgBot = '#2c2a44';
  const cloth = c.gender === 'h' ? '#3a4a63' : (c.gender === 'f' ? '#7a3f5e' : '#44425e');
  const { back, front } = hairPaths(c.hairStyle, hair);
  const facial = facialPaths(c.facial, hair);
  const glasses = c.glasses
    ? `<g fill="none" stroke="#222" stroke-width="1.6" opacity="0.85"><circle cx="40" cy="46" r="6.5"/><circle cx="60" cy="46" r="6.5"/><line x1="46.5" y1="45" x2="53.5" y2="45"/><line x1="33.5" y1="45" x2="28" y2="43"/><line x1="66.5" y1="45" x2="72" y2="43"/></g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${bgBot}"/></linearGradient>
    <radialGradient id="sk" cx="0.4" cy="0.32" r="0.8"><stop offset="0" stop-color="${skinL}"/><stop offset="0.7" stop-color="${skin}"/><stop offset="1" stop-color="${skinD}"/></radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <path d="M14,100 C14,80 32,74 50,74 C68,74 86,80 86,100 Z" fill="${cloth}"/>
  ${back}
  <rect x="43" y="60" width="14" height="16" rx="6" fill="${skinD}"/>
  <circle cx="26.5" cy="47" r="5" fill="${skinD}"/><circle cx="73.5" cy="47" r="5" fill="${skinD}"/>
  <ellipse cx="50" cy="45" rx="23" ry="26" fill="url(#sk)"/>
  <rect x="35" y="38" width="9" height="2.4" rx="1.2" fill="${browC}"/><rect x="56" y="38" width="9" height="2.4" rx="1.2" fill="${browC}"/>
  <g>
    <ellipse cx="40" cy="46" rx="4.4" ry="3.6" fill="#fff"/><ellipse cx="60" cy="46" rx="4.4" ry="3.6" fill="#fff"/>
    <circle cx="40.5" cy="46.4" r="2.4" fill="${eye}"/><circle cx="60.5" cy="46.4" r="2.4" fill="${eye}"/>
    <circle cx="40.5" cy="46.4" r="1.1" fill="#1a1a1a"/><circle cx="60.5" cy="46.4" r="1.1" fill="#1a1a1a"/>
    <circle cx="39.3" cy="45.2" r="0.7" fill="#fff"/><circle cx="59.3" cy="45.2" r="0.7" fill="#fff"/>
  </g>
  <path d="M49,49 L47,55 Q50,57 53,55" fill="none" stroke="${skinD}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M43,60 Q50,66 57,60" fill="none" stroke="${shade(skin, -0.4)}" stroke-width="1.8" stroke-linecap="round"/>
  ${facial}
  ${front}
  ${glasses}
</svg>`;
}

export function avatarDataUrl(cfg) {
  return 'data:image/svg+xml,' + encodeURIComponent(generateAvatarSVG(cfg));
}
