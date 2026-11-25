// Todo el arte se dibuja por código y se guarda en caché.
// Estilo: formas con contorno oscuro, luz desde arriba a la izquierda.
const ART_RES = 2;           // resolución interna de los sprites
const OUT = '#1b140f';
const SPRITE_CACHE = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return c;
}
function cached(key, w, h, draw) {
  let c = SPRITE_CACHE.get(key);
  if (!c) {
    c = makeCanvas(w * ART_RES, h * ART_RES);
    const g = c.getContext('2d');
    g.scale(ART_RES, ART_RES);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    SPRITE_CACHE.set(key, c);
  }
  return c;
}

// ───────── primitivas ─────────
function shape(g, pts, fill, line = 1.2) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (line) { g.lineWidth = line; g.strokeStyle = OUT; g.stroke(); }
}
function box(g, x, y, w, h, fill, line = 1.2, r = 0) {
  g.beginPath();
  if (r && g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  g.fillStyle = fill; g.fill();
  if (line) { g.lineWidth = line; g.strokeStyle = OUT; g.stroke(); }
}
function oval(g, x, y, rx, ry, fill, line = 1.2, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (line) { g.lineWidth = line; g.strokeStyle = OUT; g.stroke(); }
}
// Extremidad: trazo grueso con contorno
function limb(g, pts, width, color) {
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  };
  path(); g.lineWidth = width + 2; g.strokeStyle = OUT; g.stroke();
  path(); g.lineWidth = width; g.strokeStyle = color; g.stroke();
}
function shade(color, k) {
  const n = parseInt(color.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
}

// ───────── armas (dibujadas en la mano, apuntando hacia arriba) ─────────
function weapon(g, kind, x, y, ang, faction) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  if (kind === 'sword') {
    shape(g, [[-1.4, -2], [-1.4, -13], [0, -15.5], [1.4, -13], [1.4, -2]], '#dfe6ee', 0.9);
    box(g, -3.5, -2.6, 7, 1.8, '#d8ae45', 0.8);
    box(g, -1, -1, 2, 4, '#6b4424', 0.8);
  } else if (kind === 'cleaver') {
    shape(g, [[-1, -2], [-1.5, -12], [1, -15], [4.5, -12], [3, -7], [1.5, -2]], '#b9c0c4', 0.9);
    box(g, -1.2, -2, 2.4, 5, '#4f3119', 0.8);
  } else if (kind === 'axe') {
    limb(g, [[0, 3], [0, -10]], 1.6, '#7b5230');
    shape(g, [[0.5, -11], [5.5, -13], [6.5, -8], [5, -5], [0.5, -7.5]], '#c3cacf', 0.9);
  } else if (kind === 'bigclub') {
    limb(g, [[0, 3], [0, -8]], 2.6, '#6e4a2a');
    oval(g, 0, -13, 4.6, 6.2, '#8a5f36', 1);
    for (const [px, py] of [[-4.6, -14], [4.6, -12], [0, -19]]) shape(g, [[px - 1.2, py + 1.2], [px + (px > 0 ? 1.8 : px < 0 ? -1.8 : 0), py - 1.2], [px + 1.2, py + 1.2]], '#d9d2c0', 0.7);
  } else if (kind === 'lance') {
    limb(g, [[0, 9], [0, -17]], 1.8, '#9a6b3c');
    shape(g, [[-2, -17], [0, -23], [2, -17]], '#e8eef4', 0.9);
    shape(g, [[0.8, -16], [8, -14], [0.8, -11]], FACTIONS[faction].color, 0.8);
  } else if (kind === 'hammer') {
    limb(g, [[0, 4], [0, -9]], 1.6, '#7b5230');
    box(g, -3.5, -12.5, 7, 4.5, '#8f989e', 0.9, 1);
  } else if (kind === 'bow') {
    g.beginPath(); g.arc(-3, -2, 9, -1.15, 1.15); g.lineWidth = 3.4; g.strokeStyle = OUT; g.stroke();
    g.beginPath(); g.arc(-3, -2, 9, -1.15, 1.15); g.lineWidth = 1.8; g.strokeStyle = '#a9713a'; g.stroke();
    g.beginPath(); g.moveTo(0.7, -10.2); g.lineTo(0.7, 6.2); g.lineWidth = 0.7; g.strokeStyle = '#efe9d8'; g.stroke();
  } else if (kind === 'staff') {
    limb(g, [[0, 8], [0, -13]], 1.6, '#8a5f36');
    if (faction === 'human') {
      oval(g, 0, -16, 3.2, 3.2, '#ffe38a', 0.9);
      limb(g, [[0, -21], [0, -19]], 0.8, '#ffe38a');
    } else {
      oval(g, 0, -15, 3, 3.2, '#e8e0c8', 0.9);
      oval(g, -1.1, -15.4, 0.8, 0.9, '#3dff6a', 0);
      oval(g, 1.1, -15.4, 0.8, 0.9, '#3dff6a', 0);
      limb(g, [[0, -12], [4, -9]], 0.8, FACTIONS.orc.color);
    }
  }
  g.restore();
}

// ───────── cabezas ─────────
function head(g, cfg, x, y, view) {
  const { faction, type } = cfg;
  const col = FACTIONS[faction];
  const orc = faction === 'orc';
  const skin = orc ? '#6aa83f' : '#f0bd8d';
  const r = orc ? 5.8 : 5.2;
  if (orc) {
    // orejas puntiagudas
    if (view !== 'side') {
      shape(g, [[x - 4.5, y - 1], [x - 10, y - 4], [x - 4.5, y + 2]], skin, 1);
      shape(g, [[x + 4.5, y - 1], [x + 10, y - 4], [x + 4.5, y + 2]], skin, 1);
    }
  }
  oval(g, x, y, r, r * 0.96, skin);
  if (view === 'front') {
    if (orc) {
      box(g, x - 4.2, y - 2.6, 8.4, 1.6, '#4d7f2c', 0);
      oval(g, x - 2.2, y - 0.4, 1, 0.9, '#ffd23a', 0);
      oval(g, x + 2.2, y - 0.4, 1, 0.9, '#ffd23a', 0);
      box(g, x - 3, y + 2.2, 6, 1.4, '#2f4d1c', 0);
      shape(g, [[x - 3, y + 3.4], [x - 2.4, y + 0.8], [x - 1.4, y + 3]], '#fff7dc', 0.6);
      shape(g, [[x + 3, y + 3.4], [x + 2.4, y + 0.8], [x + 1.4, y + 3]], '#fff7dc', 0.6);
    } else {
      oval(g, x - 1.9, y, 0.8, 1, '#241a14', 0);
      oval(g, x + 1.9, y, 0.8, 1, '#241a14', 0);
      box(g, x - 1.5, y + 2.7, 3, 0.8, '#a8705a', 0);
    }
  } else if (view === 'side') {
    if (orc) {
      shape(g, [[x - 2, y - 1], [x - 7.5, y - 4.5], [x - 1, y + 1.6]], skin, 1);
      oval(g, x + 3, y - 0.6, 1, 0.9, '#ffd23a', 0);
      box(g, x + 1, y - 2.6, 4.6, 1.5, '#4d7f2c', 0);
      oval(g, x + 4.4, y + 2.2, 2.6, 2, skin, 0.8);
      shape(g, [[x + 3.6, y + 2.6], [x + 5, y - 0.2], [x + 5.8, y + 2.4]], '#fff7dc', 0.6);
    } else {
      oval(g, x + 2.7, y, 0.8, 1, '#241a14', 0);
      oval(g, x + 5, y + 1.2, 1.4, 1.2, skin, 0.7);
    }
  }
  // sombreros y cascos
  if (type === 'worker') {
    if (orc) {
      limb(g, [[x - 2, y - 5], [x - 1, y - 8]], 1.4, '#2a1f18');
      limb(g, [[x + 0.5, y - 5.4], [x + 2, y - 8]], 1.4, '#2a1f18');
    } else {
      oval(g, x, y - 3.4, 7.6, 2.4, '#d9b45c');
      oval(g, x, y - 5.2, 4.2, 2.8, '#e6c571');
      box(g, x - 4, y - 5, 8, 1.3, col.color, 0);
    }
  } else if (type === 'melee') {
    const metal = orc ? '#6f747a' : '#c9d2dc';
    g.beginPath(); g.arc(x, y - 1.2, r + 0.5, Math.PI, 0); g.closePath();
    g.fillStyle = metal; g.fill(); g.lineWidth = 1.2; g.strokeStyle = OUT; g.stroke();
    if (orc) {
      shape(g, [[x - 5, y - 3], [x - 9.5, y - 10], [x - 3, y - 6]], '#efe6cc', 1);
      shape(g, [[x + 5, y - 3], [x + 9.5, y - 10], [x + 3, y - 6]], '#efe6cc', 1);
    } else {
      box(g, x - 6, y - 2.2, 12, 1.7, '#9aa5b1', 0.8);
      if (view === 'front') box(g, x - 0.8, y - 2, 1.6, 4, metal, 0.7);
      shape(g, [[x - 1, y - 6.5], [x - 4, y - 11], [x + 2.5, y - 10], [x + 1.4, y - 6.4]], col.color, 0.9);
    }
  } else if (type === 'ranged') {
    if (orc) {
      shape(g, [[x - 1.5, y - 4], [x - 4, y - 11], [x, y - 8], [x + 1, y - 12], [x + 2.5, y - 4.5]], col.color, 0.9);
    } else {
      shape(g, [[x - 6, y - 0.5], [x - 4.5, y - 6.5], [x + 1, y - 8.5], [x + 6, y - 4], [x + 6, y - 0.5], [x + 3.5, y - 3], [x - 3.5, y - 3]], '#3f6b45');
      shape(g, [[x + 2, y - 8], [x + 8, y - 12], [x + 4.5, y - 5.5]], col.light, 0.8);
    }
  } else if (type === 'cavalry' && !orc) {
    g.beginPath(); g.arc(x, y - 0.5, r + 0.6, Math.PI * 0.95, Math.PI * 0.05); g.closePath();
    g.fillStyle = '#dbe3ec'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = OUT; g.stroke();
    if (view !== 'back') box(g, view === 'side' ? x - 1 : x - 5, y - 0.8, view === 'side' ? 7 : 10, 4.6, '#c2ccd8', 1);
    if (view !== 'back') box(g, view === 'side' ? x + 1 : x - 4, y + 0.4, view === 'side' ? 4.6 : 8, 0.9, '#1b140f', 0);
    shape(g, [[x - 1, y - 6], [x - 7, y - 10], [x - 8, y - 5], [x - 3, y - 4]], col.color, 0.9);
    shape(g, [[x - 1.5, y - 6], [x + 1, y - 12], [x + 4, y - 7]], col.light, 0.9);
  } else if (type === 'caster') {
    if (orc) {
      // máscara de hueso con plumas
      for (let i = -2; i <= 2; i++)
        shape(g, [[x + i * 2 - 1.2, y - 4], [x + i * 3.6, y - 12 + Math.abs(i) * 1.6], [x + i * 2 + 1.2, y - 4]], i % 2 ? '#e8d9a0' : col.color, 0.8);
      oval(g, x, y - 3.8, 5.2, 2.2, '#e8e0c8', 1);
    } else {
      shape(g, [[x - 4.6, y - 3.4], [x - 2.5, y - 10], [x, y - 12.5], [x + 2.5, y - 10], [x + 4.6, y - 3.4]], '#f4efe2', 1.1);
      box(g, x - 0.7, y - 10, 1.4, 5.5, '#d8ae45', 0);
      box(g, x - 2.2, y - 8.4, 4.4, 1.3, '#d8ae45', 0);
    }
  }
  if (view === 'back' && !orc && (type === 'worker' || type === 'caster')) box(g, x - 3.5, y + 1, 7, 3, '#6b4424', 0);
}

// ───────── humanoide ─────────
// view: front | back | side (mirando a la derecha) · frame: 0 quieto, 1-2 pasos, 3 preparar, 4 golpe
function humanoid(g, cfg, view, frame, cx, base, mounted) {
  const { faction, type } = cfg;
  const col = FACTIONS[faction];
  const orc = faction === 'orc';
  const skin = orc ? '#6aa83f' : '#f0bd8d';
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = step ? -0.8 : 0;
  const heavy = orc || type === 'melee' || type === 'cavalry';
  const bw = (orc ? 13 : 11) + (type === 'melee' ? 1 : 0) + (type === 'cavalry' && orc ? 5 : 0);
  const hipY = base - 8 + bob, shY = base - 18.5 + bob;

  const pants = orc ? '#5a3d27' : type === 'cavalry' ? '#aab4c0' : '#5b4a3a';
  const boots = orc ? '#3b2a1c' : '#42301f';
  let torso = col.color;
  if (type === 'melee') torso = orc ? shade(col.color, -0.15) : '#b9c3ce';
  if (type === 'worker') torso = orc ? '#8a6238' : '#c9a876';
  if (type === 'ranged') torso = orc ? col.color : '#4f7d52';
  if (type === 'caster') torso = orc ? '#6d4a2c' : '#f0ead9';
  if (type === 'cavalry') torso = orc ? skin : '#d3dbe5';

  // capa
  if ((type === 'cavalry' && !orc) || type === 'caster') {
    const c = type === 'caster' && orc ? shade(col.color, -0.3) : col.color;
    if (view === 'side') shape(g, [[cx - 2, shY], [cx - 9 - step, base - 4], [cx - 2, base - 3]], c);
    else if (view === 'front') shape(g, [[cx - bw / 2, shY], [cx - bw / 2 - 3, base - 3], [cx + bw / 2 + 3, base - 3], [cx + bw / 2, shY]], c);
  }

  // piernas
  if (!mounted) {
    if (view === 'side') {
      limb(g, [[cx - 1, hipY], [cx - 2 - step * 3.5, base - 1 - (step < 0 ? 1.5 : 0)]], heavy ? 4 : 3.4, shade(pants, -0.2));
      limb(g, [[cx + 1, hipY], [cx + 2 + step * 3.5, base - 1 - (step > 0 ? 1.5 : 0)]], heavy ? 4 : 3.4, pants);
      oval(g, cx - 1 - step * 3.5, base - 0.5 - (step < 0 ? 1.5 : 0), 2.8, 1.6, boots, 0.9);
      oval(g, cx + 3 + step * 3.5, base - 0.5 - (step > 0 ? 1.5 : 0), 2.8, 1.6, boots, 0.9);
    } else {
      for (const s of [-1, 1]) {
        const lift = step === s ? 2.2 : 0;
        limb(g, [[cx + s * 2.6, hipY], [cx + s * 3.2, base - 1.5 - lift]], heavy ? 4 : 3.4, pants);
        oval(g, cx + s * 3.3, base - 0.6 - lift, 2.5, 1.8, boots, 0.9);
      }
    }
  }

  // brazo y arma
  const wk = type === 'worker' ? (orc ? 'axe' : 'hammer') : type === 'melee' ? (orc ? 'cleaver' : 'sword')
    : type === 'ranged' ? (orc ? 'axe' : 'bow') : type === 'cavalry' ? (orc ? 'bigclub' : 'lance') : 'staff';
  const dir = view === 'side' ? 1 : view === 'front' ? 1 : -1;
  let hx = cx + dir * (bw / 2 + 1.5), hy = shY + 7 - (step * 0.6), ang = 0.25 * dir;
  if (view === 'side') { hx = cx + 4; ang = 0.5; }
  if (wk === 'lance' || wk === 'staff') ang = 0.08 * dir;
  if (frame === 3) {
    if (wk === 'bow') { hx = cx + (view === 'side' ? 8 : dir * 6); hy = shY + 3; ang = 0; }
    else if (wk === 'lance') { hx -= view === 'side' ? 5 : 0; hy = shY + 6; ang = view === 'side' ? 1.45 : 0.1 * dir; }
    else if (wk === 'staff') { hy = shY + 1; ang = 0.15 * dir; }
    else { hx = cx + (view === 'side' ? -2 : dir * (bw / 2 + 2)); hy = shY - 1; ang = view === 'side' ? -0.8 : -0.35 * dir; }
  }
  if (frame === 4) {
    if (wk === 'bow') { hx = cx + (view === 'side' ? 9 : dir * 6); hy = shY + 3; ang = 0; }
    else if (wk === 'lance') { hx += view === 'side' ? 6 : 0; hy = shY + 7; ang = view === 'side' ? 1.55 : view === 'front' ? 2.8 : 0; }
    else if (wk === 'staff') { hy = shY - 1; ang = 0.3 * dir; }
    else { hx = cx + (view === 'side' ? 8 : dir * (bw / 2)); hy = shY + (view === 'back' ? 1 : 9); ang = view === 'side' ? 1.9 : view === 'front' ? 2.5 : 0.7; }
  }
  const armW = type === 'cavalry' && orc ? 5 : heavy ? 3.8 : 3.2;
  const armCol = type === 'cavalry' || (orc && type !== 'caster') ? (type === 'cavalry' && !orc ? '#c2ccd8' : skin) : torso;
  const drawWeaponArm = () => {
    const sx = view === 'side' ? cx : cx + dir * (bw / 2 - 1);
    limb(g, [[sx, shY + 2.5], [hx, hy]], armW, armCol);
    weapon(g, wk, hx, hy, ang, faction);
    oval(g, hx, hy, 2, 2, skin, 0.9);
    if (wk === 'bow' && frame === 3) limb(g, [[hx - 9, hy - 2], [hx + 4, hy - 2]], 0.7, '#e9e2cf');
  };

  if (view === 'back' || (view === 'side' && frame === 3)) drawWeaponArm();

  // otro brazo
  if (view !== 'side') limb(g, [[cx - dir * (bw / 2 - 1), shY + 2.5], [cx - dir * (bw / 2 + 1.8), shY + 8 + step * 0.8]], armW, armCol);

  // torso
  if (type === 'caster') {
    shape(g, [[cx - bw / 2 + 1, shY], [cx + bw / 2 - 1, shY], [cx + bw / 2 + 1, base - 1.5], [cx - bw / 2 - 1, base - 1.5]], torso);
    box(g, cx - 1.4, shY + 1, 2.8, base - shY - 3, orc ? '#e8d9a0' : col.color, 0);
  } else {
    const w = view === 'side' ? bw * 0.78 : bw;
    shape(g, [[cx - w / 2, shY + 1], [cx - w / 4, shY - 1], [cx + w / 4, shY - 1], [cx + w / 2, shY + 1], [cx + w / 2 - 1.5, hipY + 1.5], [cx - w / 2 + 1.5, hipY + 1.5]], torso);
    // volumen
    shape(g, [[cx + w / 4, shY], [cx + w / 2 - 0.6, shY + 1.5], [cx + w / 2 - 2, hipY + 0.8], [cx + w / 8, hipY + 0.8]], 'rgba(0,0,0,0.18)', 0);
    box(g, cx - w / 2 + 1.4, hipY - 2, w - 2.8, 2.2, orc ? '#3b2a1c' : '#5a3a20', 0.8);
    if (type === 'melee' && !orc && view !== 'side') {
      box(g, cx - 3, shY + 1, 6, hipY - shY - 1, col.color, 0.8);
      box(g, cx - 0.7, shY + 2.5, 1.4, 5, '#f2d36b', 0);
      box(g, cx - 2.2, shY + 3.6, 4.4, 1.3, '#f2d36b', 0);
    }
    if (orc && type !== 'cavalry' && view !== 'side') {
      limb(g, [[cx - w / 2 + 2, shY + 1], [cx + w / 2 - 2.5, hipY - 2]], 1.4, '#3b2a1c');
      if (type === 'melee') oval(g, cx - w / 2 + 1, shY + 1.5, 3, 2.4, '#7d848b', 1);
    }
    if (type === 'cavalry') {
      if (orc) {
        box(g, cx - 6, hipY - 4, 12, 4, col.color, 1);
        oval(g, cx, hipY - 2, 2, 2, '#e8d9a0', 0.8);
        oval(g, cx - bw / 2 + 1, shY + 1, 4, 3, '#6f747a', 1);
        shape(g, [[cx - bw / 2 - 1, shY], [cx - bw / 2 - 2, shY - 5], [cx - bw / 2 + 2, shY - 1.5]], '#efe6cc', 0.8);
      } else {
        box(g, cx - 2, shY, 4, hipY - shY, col.color, 0.8);
        oval(g, cx - w / 2 + 1, shY + 1, 3, 2.6, '#e8eef4', 1);
        oval(g, cx + w / 2 - 1, shY + 1, 3, 2.6, '#e8eef4', 1);
      }
    }
    if (type === 'worker' && view === 'front' && !orc) box(g, cx - 3, shY + 4, 6, hipY - shY - 3, '#8b6b45', 0.8);
  }
  if (view === 'back') {
    if (type === 'ranged' && !orc) {
      shape(g, [[cx - 4, shY], [cx + 1, shY - 1], [cx + 3, hipY - 1], [cx - 2, hipY]], '#7b4f2a', 0.9);
      for (const k of [-3, -1, 1]) limb(g, [[cx + k, shY - 1], [cx + k - 1, shY - 4]], 0.8, '#e9e2cf');
    }
  }

  const hy2 = shY - (type === 'cavalry' && orc ? 2.5 : 4);
  head(g, cfg, cx + (view === 'side' ? 1 : 0), hy2, view);

  if (view === 'front' || (view === 'side' && frame !== 3)) drawWeaponArm();

  // escudo
  if (type === 'melee') {
    const ex = view === 'side' ? cx - 1 : view === 'front' ? cx - bw / 2 - 1.5 : cx + bw / 2 + 1.5, ey = shY + 8;
    if (orc) {
      oval(g, ex, ey, 5, 5.6, '#7b5230');
      oval(g, ex, ey, 3.2, 3.6, col.color, 0.8);
      oval(g, ex, ey, 1.3, 1.3, '#c3cacf', 0.7);
    } else {
      shape(g, [[ex - 4.6, ey - 5], [ex + 4.6, ey - 5], [ex + 4, ey + 2], [ex, ey + 6.5], [ex - 4, ey + 2]], col.color);
      box(g, ex - 0.8, ey - 4, 1.6, 8, '#f2d36b', 0);
      box(g, ex - 3, ey - 2.2, 6, 1.5, '#f2d36b', 0);
    }
  }
}

// ───────── jinete (caballero humano) ─────────
function knight(g, cfg, view, frame, cx, base) {
  const col = FACTIONS[cfg.faction];
  const hide = '#8a5a33', hide2 = '#6b4325', mane = '#2e1d10';
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const bob = step ? -1 : 0;
  if (view === 'side') {
    const leg = (x, s, c) => {
      limb(g, [[x, base - 11 + bob], [x + s * 3.5, base - 6], [x + s * 2.5, base - 1 - (s > 0 ? 2 : 0)]], 3, c);
    };
    leg(cx - 9, -step, hide2); leg(cx + 7, step, hide2);
    shape(g, [[cx - 12, base - 17 + bob], [cx - 19, base - 11], [cx - 18, base - 5], [cx - 12, base - 12]], mane);
    oval(g, cx - 1, base - 13 + bob, 13.5, 7.2, hide);
    leg(cx - 6, step, hide); leg(cx + 10, -step, hide);
    shape(g, [[cx + 6, base - 17 + bob], [cx + 13, base - 28 + bob], [cx + 18, base - 26 + bob], [cx + 13, base - 11 + bob]], hide);
    shape(g, [[cx + 7, base - 18 + bob], [cx + 12, base - 29 + bob], [cx + 14, base - 26 + bob], [cx + 10, base - 17 + bob]], mane, 0.9);
    oval(g, cx + 18, base - 24 + bob, 6, 3.6, hide, 1.2, 0.55);
    shape(g, [[cx + 13, base - 27 + bob], [cx + 14, base - 32 + bob], [cx + 17, base - 27 + bob]], hide, 1);
    oval(g, cx + 17, base - 25.5 + bob, 0.9, 0.9, OUT, 0);
    shape(g, [[cx - 8, base - 20 + bob], [cx + 6, base - 20 + bob], [cx + 8, base - 9 + bob], [cx - 10, base - 9 + bob]], col.color);
    box(g, cx - 9, base - 11 + bob, 16, 1.6, '#f2d36b', 0);
    humanoid(g, cfg, view, frame, cx - 2, base - 10 + bob, true);
    limb(g, [[cx - 2, base - 18 + bob], [cx + 2, base - 11 + bob], [cx + 1, base - 6 + bob]], 3.4, '#aab4c0');
  } else {
    const front = view === 'front';
    for (const s of [-1, 1]) {
      const lift = step === s ? 2.5 : 0;
      limb(g, [[cx + s * 4.5, base - 10], [cx + s * 5, base - 1 - lift]], 3.4, hide2);
      oval(g, cx + s * 5, base - 0.5 - lift, 2.2, 1.5, OUT, 0);
    }
    if (front) {
      humanoid(g, cfg, view, frame, cx, base - 15 + bob, true);
      oval(g, cx, base - 12 + bob, 9, 7.5, hide);
      shape(g, [[cx - 9, base - 15 + bob], [cx + 9, base - 15 + bob], [cx + 8, base - 8 + bob], [cx - 8, base - 8 + bob]], col.color);
      shape(g, [[cx - 4.5, base - 20 + bob], [cx + 4.5, base - 20 + bob], [cx + 3, base - 7 + bob], [cx - 3, base - 7 + bob]], hide);
      shape(g, [[cx - 4.5, base - 19 + bob], [cx - 5, base - 25 + bob], [cx - 1.5, base - 20 + bob]], hide, 1);
      shape(g, [[cx + 4.5, base - 19 + bob], [cx + 5, base - 25 + bob], [cx + 1.5, base - 20 + bob]], hide, 1);
      box(g, cx - 1, base - 19 + bob, 2, 8, '#f4e9d8', 0);
      oval(g, cx - 2.6, base - 15 + bob, 0.9, 1, OUT, 0);
      oval(g, cx + 2.6, base - 15 + bob, 0.9, 1, OUT, 0);
    } else {
      oval(g, cx, base - 13 + bob, 8.5, 8, hide);
      humanoid(g, cfg, view, frame, cx, base - 10 + bob, true);
      shape(g, [[cx - 8, base - 14 + bob], [cx + 8, base - 14 + bob], [cx + 7, base - 7 + bob], [cx - 7, base - 7 + bob]], col.color);
      shape(g, [[cx - 2.5, base - 12 + bob], [cx + 2.5, base - 12 + bob], [cx + 3.5 + step, base - 2], [cx - 3.5 + step, base - 2]], mane);
    }
    for (const s of [-1, 1]) limb(g, [[cx + s * 6, base - 17 + bob], [cx + s * 10, base - 9 + bob]], 3, '#aab4c0');
  }
}

// ───────── catapulta ─────────
function catapult(g, faction, view, frame, cx, base) {
  const col = FACTIONS[faction];
  const wood = faction === 'orc' ? '#6e4a2a' : '#a5733f', dark = shade(wood, -0.35);
  const roll = frame === 1 ? 0.6 : frame === 2 ? 1.2 : 0;
  const armAng = frame === 4 ? 0.55 : frame === 3 ? -1.0 : -0.75;
  const wheel = (x, y, r) => {
    oval(g, x, y, r, r, dark);
    oval(g, x, y, r * 0.45, r * 0.45, '#8f989e', 0.9);
    for (let i = 0; i < 4; i++) {
      const a = roll + i * Math.PI / 2;
      limb(g, [[x, y], [x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8]], 0.8, wood);
    }
  };
  const arm = (x, y, ang) => {
    const ex = x + Math.sin(ang) * 20, ey = y - Math.cos(ang) * 20;
    limb(g, [[x, y], [ex, ey]], 3, wood);
    oval(g, ex, ey, 4.2, 3, dark);
    if (frame !== 4) oval(g, ex, ey - 2.4, 3.4, 3.2, '#8b8d90');
  };
  if (view === 'side') {
    wheel(cx - 9, base - 8, 5.5); wheel(cx + 11, base - 8, 5.5);
    shape(g, [[cx - 15, base - 12], [cx + 16, base - 12], [cx + 14, base - 6], [cx - 13, base - 6]], wood);
    shape(g, [[cx - 1, base - 11], [cx + 4, base - 24], [cx + 8, base - 11]], dark);
    arm(cx + 3, base - 15, armAng);
    box(g, cx - 2, base - 24, 11, 3, col.color, 1);
    wheel(cx - 11, base - 5, 6); wheel(cx + 9, base - 5, 6);
  } else {
    const s = view === 'front' ? 1 : -1;
    for (const k of [-1, 1]) { box(g, cx + k * 14 - 3, base - 20, 6, 10, dark, 1.2, 3); }
    box(g, cx - 11, base - 18, 22, 13, wood);
    shape(g, [[cx - 10, base - 12], [cx - 6, base - 26], [cx - 3, base - 12]], dark);
    shape(g, [[cx + 10, base - 12], [cx + 6, base - 26], [cx + 3, base - 12]], dark);
    box(g, cx - 8, base - 26, 16, 3, wood);
    const len = frame === 4 ? 9 * s : -7 * s;
    limb(g, [[cx, base - 18], [cx, base - 24 + len]], 3, wood);
    oval(g, cx, base - 24 + len, 4.5, 3, dark);
    if (frame !== 4) oval(g, cx, base - 26 + len, 3.4, 3.2, '#8b8d90');
    box(g, cx - 8, base - 9, 16, 4, col.color, 1);
    for (const k of [-1, 1]) { box(g, cx + k * 14 - 3.5, base - 11, 7, 11, dark, 1.2, 3); box(g, cx + k * 14 - 1, base - 9 + roll * 2, 2, 3, '#8f989e', 0); }
  }
  if (faction === 'orc') {
    oval(g, cx, base - 7, 3, 3.2, '#e8e0c8', 0.9);
    shape(g, [[cx - 3, base - 8], [cx - 7, base - 12], [cx - 1.5, base - 10]], '#e8e0c8', 0.8);
    shape(g, [[cx + 3, base - 8], [cx + 7, base - 12], [cx + 1.5, base - 10]], '#e8e0c8', 0.8);
  }
}

// Sprite de unidad: lienzo de 56x56, pies en (28, 48)
const USPR = { w: 56, h: 56, ax: 28, ay: 48 };
function unitSprite(faction, type, view, frame, flip) {
  return cached(`u:${faction}:${type}:${view}:${frame}:${flip ? 1 : 0}`, USPR.w, USPR.h, g => {
    if (flip) { g.translate(USPR.w, 0); g.scale(-1, 1); }
    const cx = USPR.ax, base = USPR.ay;
    if (type === 'siege') catapult(g, faction, view, frame, cx, base);
    else if (type === 'cavalry' && faction === 'human') knight(g, { faction, type }, view, frame, cx, base);
    else {
      const s = type === 'cavalry' ? 1.3 : type === 'worker' ? 0.95 : 1.05;
      g.translate(cx, base); g.scale(s, s); g.translate(-cx, -base);
      humanoid(g, { faction, type }, view, frame, cx, base);
    }
  });
}
// Carga que lleva un obrero
function drawCarry(g, type, x, y) {
  if (type === 'gold') {
    oval(g, x, y, 5, 4.5, '#b58a3c', 1);
    oval(g, x - 1.5, y - 3.5, 2.2, 2, '#ffd84a', 0.8);
    oval(g, x + 2, y - 3, 2, 1.8, '#ffec8a', 0.8);
  } else {
    for (const [dx, dy] of [[0, 0], [1, -3.5], [-1, 3.5]]) {
      box(g, x - 7 + dx, y - 1.8 + dy, 13, 3.4, '#8a5f36', 0.9, 1.5);
      oval(g, x + 6 + dx, y - 0.1 + dy, 1.5, 1.7, '#e2bd86', 0.7);
    }
  }
}

// ───────── árboles ─────────
function treeSprite(v) {
  return cached('tree:' + v, 48, 60, g => {
    const rng = makeRng(v * 977 + 13);
    oval(g, 27, 50, 15, 6, 'rgba(0,0,0,0.28)', 0);
    box(g, 21, 38, 7, 13, '#6b4424', 1.2, 2);
    if (v % 3 === 2) {
      // frondoso
      const greens = ['#2c5a27', '#386e2e', '#4a8737', '#63a044'];
      oval(g, 24, 27, 17, 17, greens[0], 1.4);
      for (let i = 0; i < 16; i++) {
        const layer = 1 + Math.floor(i / 6);
        oval(g, 24 - layer * 2 + (rng() - 0.5) * (30 - layer * 6), 27 - layer * 3 + (rng() - 0.5) * (24 - layer * 5), 6 - layer * 0.7, 5 - layer * 0.6, greens[layer], 0);
      }
    } else {
      // pino
      const base = v % 3 === 0 ? '#2b5b33' : '#316434';
      const tiers = [[46, 19, 30], [35, 16, 19], [25, 12.5, 9], [16, 9, 1]];
      for (const [by, hw, top] of tiers) {
        const pts = [[24, top]];
        pts.push([24 + hw, by]);
        for (let i = 3; i >= -3; i--) pts.push([24 + hw * i / 4, by + (i % 2 ? -3.5 : 0.5) + rng()]);
        pts.push([24 - hw, by]);
        shape(g, pts, base, 1.2);
        shape(g, [[24, top + 2], [24 - hw * 0.8, by - 2], [24 - hw * 0.2, by - 4]], shade(base, 0.22), 0);
      }
    }
  });
}
function stumpSprite() {
  return cached('stump', 32, 32, g => {
    oval(g, 17, 22, 8, 4, 'rgba(0,0,0,0.25)', 0);
    box(g, 10, 14, 11, 7, '#6b4424', 1, 2);
    oval(g, 15.5, 14, 5.5, 3, '#d6ae74', 1);
    oval(g, 15.5, 14, 2.5, 1.3, '#a97d46', 0);
  });
}

// ───────── edificios ─────────
// Cada sprite deja 32px de margen arriba para techos y estandartes.
const BTOP = 32;
function wall(g, x, y, w, h, faction, rng) {
  if (faction === 'human') {
    box(g, x, y, w, h, '#b9b2a4');
    for (let j = 0; j < h - 3; j += 6)
      for (let i = (j / 6 % 2) * 5; i < w - 6; i += 11)
        box(g, x + i + 1, y + j + 1, 9, 4.5, shade('#b9b2a4', (rng() - 0.5) * 0.25), 0);
  } else {
    box(g, x, y, w, h, '#7a5230');
    for (let i = 2; i < w - 4; i += 7) {
      box(g, x + i, y + 1, 5, h - 2, shade('#7a5230', (rng() - 0.5) * 0.35), 0);
      limb(g, [[x + i + 6, y + 2], [x + i + 6, y + h - 2]], 0.6, '#3f2916');
    }
  }
  box(g, x + w * 0.72, y, w * 0.28, h, 'rgba(0,0,0,0.18)', 0);
}
function roof(g, x, y, w, h, faction, color) {
  if (faction === 'human') {
    const c = color || '#3f63a8';
    shape(g, [[x - 4, y + h], [x + w * 0.22, y], [x + w * 0.78, y], [x + w + 4, y + h]], c, 1.4);
    shape(g, [[x + w * 0.78, y], [x + w + 4, y + h], [x + w * 0.6, y + h]], 'rgba(0,0,0,0.2)', 0);
    for (let j = 5; j < h; j += 5) {
      const t = j / h, x0 = x - 4 + (w * 0.22 + 4) * (1 - t), x1 = x + w + 4 - (w * 0.22 + 4) * (1 - t);
      limb(g, [[x0 + 2, y + j], [x1 - 2, y + j]], 0.01, shade(c, -0.4));
      for (let i = x0 + 4 + (j % 10 ? 3 : 0); i < x1 - 4; i += 7) box(g, i, y + j, 0.9, 4, shade(c, -0.35), 0);
    }
    box(g, x + w * 0.2, y - 2, w * 0.6, 4, shade(c, 0.25), 1);
  } else {
    const c = color || '#a5764a';
    shape(g, [[x - 5, y + h], [x + w * 0.15, y + h * 0.4], [x + w * 0.35, y + 2], [x + w * 0.65, y + 2], [x + w * 0.85, y + h * 0.4], [x + w + 5, y + h], [x + w * 0.5, y + h - 4]], c, 1.4);
    shape(g, [[x + w * 0.65, y + 2], [x + w * 0.85, y + h * 0.4], [x + w + 5, y + h], [x + w * 0.55, y + h - 4]], 'rgba(0,0,0,0.2)', 0);
    for (const k of [0.3, 0.5, 0.7]) limb(g, [[x + w * k, y + 3], [x + w * (0.5 + (k - 0.5) * 2), y + h - 5]], 0.8, shade(c, -0.45));
    // vigas y colmillos
    limb(g, [[x + w * 0.35, y + 4], [x + w * 0.27, y - 7]], 2.4, '#5b3c22');
    limb(g, [[x + w * 0.65, y + 4], [x + w * 0.73, y - 7]], 2.4, '#5b3c22');
    for (const s of [-1, 1]) {
      const bx = x + w / 2 + s * (w / 2 + 1);
      shape(g, [[bx - s * 6, y + h - 3], [bx + s * 5, y + h - 14], [bx, y + h - 1]], '#efe6cc', 1);
    }
  }
}
function door(g, cx, by, w, h, faction) {
  g.beginPath();
  g.moveTo(cx - w / 2, by);
  g.lineTo(cx - w / 2, by - h + w / 2);
  if (faction === 'human') g.arc(cx, by - h + w / 2, w / 2, Math.PI, 0);
  else { g.lineTo(cx - w / 4, by - h); g.lineTo(cx + w / 4, by - h); g.lineTo(cx + w / 2, by - h + w / 2); }
  g.lineTo(cx + w / 2, by);
  g.closePath();
  g.fillStyle = '#2a1b10'; g.fill();
  g.lineWidth = 2; g.strokeStyle = faction === 'human' ? '#6f675b' : '#efe6cc'; g.stroke();
}
function banner(g, x, y, faction, h = 16) {
  const col = FACTIONS[faction];
  limb(g, [[x, y + h], [x, y - 2]], 1.4, '#5b3c22');
  shape(g, faction === 'human'
    ? [[x + 1, y - 1], [x + 14, y + 1], [x + 10, y + 5], [x + 14, y + 9], [x + 1, y + 9]]
    : [[x + 1, y - 1], [x + 13, y], [x + 12, y + 11], [x + 9, y + 8], [x + 6, y + 12], [x + 4, y + 8], [x + 1, y + 10]], col.color, 1);
  oval(g, x + 6, y + 4, 2, 2, faction === 'human' ? '#f2d36b' : '#efe6cc', 0);
}
function windowAt(g, x, y, faction) {
  box(g, x, y, 6, 8, '#2a1b10', 1, faction === 'human' ? 3 : 0);
  box(g, x + 1.4, y + 2, 3.2, 4.5, '#ffcf6a', 0);
}
function tower(g, x, y, w, h, faction, rng) {
  wall(g, x, y, w, h, faction, rng);
  if (faction === 'human') {
    shape(g, [[x - 3, y + 2], [x + w / 2, y - 18], [x + w + 3, y + 2]], '#3f63a8', 1.4);
    shape(g, [[x + w / 2, y - 18], [x + w + 3, y + 2], [x + w / 2, y + 2]], 'rgba(0,0,0,0.22)', 0);
  } else {
    box(g, x - 3, y - 5, w + 6, 7, '#5b3c22', 1.2);
    for (let i = 0; i <= w + 2; i += (w + 2) / 3) shape(g, [[x - 3 + i, y - 5], [x - 1 + i, y - 14], [x + 1 + i, y - 5]], '#efe6cc', 0.9);
  }
  windowAt(g, x + w / 2 - 3, y + 8, faction);
}

function buildingSprite(faction, type, stage) {
  const d = BUILDINGS[type], W = d.w * TILE, H = d.h * TILE;
  return cached(`b:${faction}:${type}:${stage}`, W + 16, H + BTOP + 8, g => {
    g.translate(8, BTOP);
    const rng = makeRng(type.length * 131 + faction.length * 17 + d.w);
    const orc = faction === 'orc';
    // sombra y suelo
    oval(g, W / 2 + 4, H - 8, W / 2 + 2, 13, 'rgba(0,0,0,0.28)', 0);
    if (type !== 'mine') oval(g, W / 2, H - 14, W / 2 - 1, 15, 'rgba(120,92,58,0.55)', 0);

    if (stage < 2) {
      // obra en construcción
      const k = stage;
      box(g, 6, H - 14, W - 12, 10, orc ? '#6e4a2a' : '#9c968a');
      if (k === 1) wall(g, 9, H * 0.52, W - 18, H * 0.48 - 10, faction, rng);
      const top = k === 1 ? H * 0.28 : H * 0.52;
      for (let x = 10; x <= W - 10; x += (W - 20) / 3) limb(g, [[x, H - 8], [x, top]], 2.6, '#b08350');
      for (const y of [top + 3, (top + H) / 2]) limb(g, [[8, y], [W - 8, y]], 2, '#b08350');
      limb(g, [[10, H - 10], [10 + (W - 20) / 3, top + 4]], 1.4, '#8a5f36');
      limb(g, [[W - 10, H - 10], [W - 10 - (W - 20) / 3, top + 4]], 1.4, '#8a5f36');
      for (let i = 0; i < 4; i++) box(g, 4 + i * 5 + rng() * 3, H - 6 - rng() * 3, 9, 5, '#a89f90', 0.9);
      return;
    }

    if (type === 'mine') {
      shape(g, [[2, H - 6], [8, H * 0.45], [24, H * 0.22], [36, 2], [56, 8], [68, H * 0.2], [86, H * 0.42], [W - 2, H - 8], [W * 0.7, H - 2], [W * 0.3, H - 1]], '#8d8579', 1.6);
      shape(g, [[36, 2], [56, 8], [68, H * 0.2], [86, H * 0.42], [W - 2, H - 8], [W * 0.62, H - 10], [W * 0.58, H * 0.3]], '#6c655b', 0);
      shape(g, [[36, 2], [24, H * 0.22], [8, H * 0.45], [30, H * 0.42], [46, H * 0.18]], '#a9a193', 0);
      shape(g, [[28, H - 4], [30, H - 34], [40, H - 44], [58, H - 44], [68, H - 33], [70, H - 4]], '#17110c', 1.4);
      for (const x of [30, 67]) limb(g, [[x, H - 4], [x, H - 36]], 5, '#8a5f36');
      limb(g, [[26, H - 38], [72, H - 38]], 5, '#a5733f');
      for (let i = 0; i < 22; i++) {
        const x = 8 + rng() * (W - 16), y = i < 12 ? H - 14 + rng() * 10 : H * 0.25 + rng() * H * 0.4;
        shape(g, [[x, y - 3.4], [x + 3, y], [x, y + 2.4], [x - 3, y]], i % 3 ? '#ffcc33' : '#ffec8a', 0.8);
      }
      return;
    }

    if (type === 'hall') {
      tower(g, 6, 28, 26, H - 44, faction, rng);
      tower(g, W - 32, 28, 26, H - 44, faction, rng);
      wall(g, 22, 56, W - 44, H - 66, faction, rng);
      roof(g, 22, 14, W - 44, 46, faction);
      door(g, W / 2, H - 10, 28, 34, faction);
      windowAt(g, 36, 70, faction); windowAt(g, W - 42, 70, faction);
      banner(g, W / 2 - 1, -12, faction, 28);
      if (orc) {
        oval(g, W / 2, 58, 9, 8, '#e8e0c8', 1.2);
        oval(g, W / 2 - 3, 57, 2, 2.2, OUT, 0); oval(g, W / 2 + 3, 57, 2, 2.2, OUT, 0);
        for (const s of [-1, 1]) shape(g, [[W / 2 + s * 7, 56], [W / 2 + s * 24, 44], [W / 2 + s * 8, 62]], '#efe6cc', 1.2);
      } else box(g, W / 2 - 8, 62, 16, 11, '#f2d36b', 1, 2);
    } else if (type === 'farm') {
      if (orc) {
        // porqueriza
        wall(g, 6, 22, 34, 24, faction, rng);
        roof(g, 6, 2, 34, 24, faction);
        door(g, 22, 46, 12, 15, faction);
        box(g, 4, 48, 56, 12, '#5d4025', 1);
        for (const [px, py] of [[44, 40], [26, 53]]) {
          oval(g, px, py, 9, 6, '#e59a90');
          oval(g, px + 8, py - 1, 4.5, 4, '#eca79c');
          oval(g, px + 11, py, 2, 1.8, '#c97c74', 0.8);
          oval(g, px + 8, py - 2.5, 0.8, 0.8, OUT, 0);
        }
        for (let x = 4; x <= 60; x += 9.3) limb(g, [[x, 62], [x, 52]], 2.4, '#8a5f36');
        limb(g, [[4, 56], [60, 56]], 1.8, '#a5733f');
      } else {
        for (let j = 0; j < 4; j++) {
          box(g, 4, 42 + j * 5, 56, 4, '#6e4a2a', 0);
          for (let i = 6; i < 58; i += 6) oval(g, i + (j % 2) * 3, 43 + j * 5, 2.2, 2.6, j % 2 ? '#e8c34a' : '#7fb04a', 0.6);
        }
        wall(g, 10, 22, 36, 22, faction, rng);
        roof(g, 10, 0, 36, 24, faction, '#c0563a');
        door(g, 28, 44, 12, 16, faction);
        windowAt(g, 37, 27, faction);
        banner(g, 52, 10, faction, 30);
      }
    } else if (type === 'barracks') {
      wall(g, 8, 36, W - 16, H - 46, faction, rng);
      roof(g, 8, 8, W - 16, 32, faction);
      door(g, W / 2, H - 10, 24, 30, faction);
      for (const x of [18, W - 24]) windowAt(g, x, 46, faction);
      banner(g, 12, -4, faction, 26); banner(g, W - 20, -4, faction, 26);
      // armas apoyadas
      weapon(g, orc ? 'axe' : 'sword', 18, H - 14, -0.5, faction);
      weapon(g, orc ? 'cleaver' : 'sword', 24, H - 14, 0.5, faction);
      oval(g, W - 18, H - 18, 8, 9, FACTIONS[faction].color);
      oval(g, W - 18, H - 18, 2.4, 2.4, '#f2d36b', 0.8);
    } else if (type === 'mill') {
      wall(g, 6, 38, 58, H - 48, faction, rng);
      roof(g, 6, 12, 58, 30, faction, orc ? '#8f6a40' : '#7d5a39');
      door(g, 34, H - 10, 18, 24, faction);
      // sierra
      const cx = W - 20, cy = 52;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        shape(g, [[cx + Math.cos(a) * 14, cy + Math.sin(a) * 14], [cx + Math.cos(a + 0.28) * 19, cy + Math.sin(a + 0.28) * 19], [cx + Math.cos(a + 0.55) * 14, cy + Math.sin(a + 0.55) * 14]], '#c3cacf', 0.8);
      }
      oval(g, cx, cy, 14.5, 14.5, '#b2bac0');
      oval(g, cx, cy, 3, 3, '#5b3c22');
      for (const [x, y] of [[62, H - 10], [78, H - 10], [70, H - 20]]) {
        box(g, x - 12, y - 5, 22, 10, '#8a5f36', 1.1, 4);
        oval(g, x + 9, y, 4, 5, '#e2bd86', 1);
        oval(g, x + 9, y, 1.5, 2, '#a97d46', 0);
      }
      banner(g, 12, -2, faction, 22);
    } else if (type === 'smith') {
      box(g, W - 32, 4, 16, 44, orc ? '#55504a' : '#8d8579');
      box(g, W - 35, 0, 22, 8, '#5f5a53');
      for (const [x, y, r] of [[W - 24, -8, 6], [W - 17, -17, 8], [W - 27, -25, 5]]) oval(g, x, y, r, r * 0.8, 'rgba(210,210,205,0.55)', 0);
      wall(g, 8, 40, W - 16, H - 50, faction, rng);
      roof(g, 8, 18, 56, 26, faction, orc ? '#6b5a50' : '#59606b');
      door(g, 30, H - 10, 24, 28, faction);
      oval(g, 30, H - 18, 8, 7, '#ff8c2a', 0);
      oval(g, 30, H - 16, 4.5, 4, '#ffe06a', 0);
      shape(g, [[58, H - 24], [84, H - 24], [78, H - 18], [74, H - 18], [76, H - 8], [64, H - 8], [66, H - 18], [62, H - 19]], '#4a4f56');
      weapon(g, 'hammer', 72, H - 28, 1.1, faction);
      banner(g, 12, 0, faction, 22);
    } else if (type === 'tower') {
      wall(g, 12, 18, W - 24, H - 26, faction, rng);
      if (orc) {
        limb(g, [[8, H - 6], [18, 18]], 4, '#5b3c22'); limb(g, [[W - 8, H - 6], [W - 18, 18]], 4, '#5b3c22');
      }
      box(g, 6, 6, W - 12, 15, orc ? '#6e4a2a' : '#a9a193');
      if (orc) for (let x = 8; x < W - 6; x += 9) shape(g, [[x, 6], [x + 3, -6], [x + 6, 6]], '#efe6cc', 0.9);
      else for (let x = 6; x < W - 8; x += 12) box(g, x, -1, 7, 8, '#b9b2a4');
      if (!orc) shape(g, [[10, -6], [W / 2, -28], [W - 10, -6]], '#3f63a8', 1.4);
      if (!orc) { limb(g, [[14, -6], [14, 0]], 2.4, '#5b3c22'); limb(g, [[W - 14, -6], [W - 14, 0]], 2.4, '#5b3c22'); }
      door(g, W / 2, H - 8, 13, 17, faction);
      windowAt(g, W / 2 - 3, 28, faction);
      banner(g, W / 2 - 2, orc ? -22 : -32, faction, 14);
    } else if (type === 'stable') {
      wall(g, 6, 40, W - 12, H - 50, faction, rng);
      roof(g, 6, 14, W - 12, 30, faction, orc ? '#7d5a45' : '#b8863f');
      if (orc) {
        shape(g, [[22, H - 10], [26, H - 38], [48, H - 46], [70, H - 38], [74, H - 10]], '#1d130c', 1.6);
        oval(g, 41, H - 26, 2.2, 2, '#ffd23a', 0); oval(g, 55, H - 26, 2.2, 2, '#ffd23a', 0);
        for (const x of [26, 70]) shape(g, [[x - 4, H - 10], [x + (x < 48 ? 8 : -8), H - 40], [x + 3, H - 12]], '#efe6cc', 1.2);
      } else {
        for (const x of [14, 52]) {
          box(g, x, H - 38, 30, 28, '#2a1b10', 1.4);
          shape(g, [[x + 10, H - 18], [x + 12, H - 34], [x + 16, H - 28], [x + 24, H - 26], [x + 23, H - 20], [x + 18, H - 20], [x + 19, H - 14], [x + 12, H - 14]], '#8a5a33', 1);
          oval(g, x + 17, H - 25, 1, 1, OUT, 0);
          box(g, x, H - 20, 30, 10, '#a5733f', 1);
          limb(g, [[x + 2, H - 18], [x + 28, H - 12]], 1.2, '#6b4424');
        }
      }
      banner(g, W / 2, -6, faction, 24);
    } else if (type === 'temple') {
      wall(g, 12, 42, W - 24, H - 52, faction, rng);
      if (orc) {
        roof(g, 12, 22, W - 24, 24, faction, '#7a3226');
        for (const x of [10, W - 10]) {
          limb(g, [[x, H - 8], [x, 18]], 5, '#6e4a2a');
          oval(g, x, 14, 6, 6, '#e8e0c8');
          oval(g, x - 2, 13, 1.4, 1.6, '#3dff6a', 0); oval(g, x + 2, 13, 1.4, 1.6, '#3dff6a', 0);
        }
        door(g, W / 2, H - 10, 22, 28, faction);
        oval(g, W / 2, H - 20, 6, 8, '#3dff6a', 0);
        shape(g, [[W / 2 - 5, 16], [W / 2, -6], [W / 2 + 5, 16], [W / 2, 22]], '#b3261c', 1.4);
      } else {
        roof(g, 12, 20, W - 24, 26, faction);
        box(g, W / 2 - 12, 2, 24, 40, '#cfc8b8');
        shape(g, [[W / 2 - 15, 4], [W / 2, -22], [W / 2 + 15, 4]], '#3f63a8', 1.4);
        box(g, W / 2 - 1.6, -31, 3.2, 12, '#f2d36b', 0.9); box(g, W / 2 - 5, -28, 10, 3.2, '#f2d36b', 0.9);
        oval(g, W / 2, 18, 7, 7, '#6fc3e8', 1.4);
        limb(g, [[W / 2 - 6, 18], [W / 2 + 6, 18]], 0.8, '#fff'); limb(g, [[W / 2, 12], [W / 2, 24]], 0.8, '#fff');
        door(g, W / 2, H - 10, 20, 30, faction);
        for (const x of [20, W - 26]) windowAt(g, x, 52, faction);
      }
    }
  });
}

// Ícono cuadrado para botones y panel
function iconCanvas(kind, id, faction) {
  const key = `i:${kind}:${id}:${faction}`;
  return cached(key, 44, 44, g => {
    const grd = g.createLinearGradient(0, 0, 0, 44);
    grd.addColorStop(0, '#6d6353'); grd.addColorStop(1, '#2e281f');
    g.fillStyle = grd; g.fillRect(0, 0, 44, 44);
    if (kind === 'unit') {
      const big = id === 'cavalry' || id === 'siege';
      const spr = unitSprite(faction, id, id === 'siege' || (id === 'cavalry' && faction === 'human') ? 'side' : 'front', 0, false);
      const s = big ? 0.9 : 1.2;
      g.drawImage(spr, 22 - USPR.ax * s, 41 - USPR.ay * s, USPR.w * s, USPR.h * s);
    } else if (kind === 'building') {
      const spr = buildingSprite(faction, id, 2);
      const w = spr.width / ART_RES, h = spr.height / ART_RES;
      const s = Math.min(42 / w, 42 / h) * 1.08;
      g.drawImage(spr, 22 - w * s / 2, 23 - h * s / 2, w * s, h * s);
    } else {
      g.translate(22, 22); g.scale(1.7, 1.7);
      if (id === 'move') shape(g, [[-9, -3], [1, -3], [1, -8], [10, 0], [1, 8], [1, 3], [-9, 3]], '#8fe06a');
      if (id === 'stop') shape(g, [[-4, -9], [4, -9], [9, -4], [9, 4], [4, 9], [-4, 9], [-9, 4], [-9, -4]], '#d9493a');
      if (id === 'hold') shape(g, [[-8, -8], [8, -8], [7, 3], [0, 10], [-7, 3]], '#c9d2dc');
      if (id === 'attack') { weapon(g, 'sword', -3, 6, 0.75, faction); weapon(g, 'sword', 3, 6, -0.75, faction); }
      if (id === 'build') weapon(g, 'hammer', -1, 4, 0.6, faction);
      if (id === 'repair') { weapon(g, 'hammer', -3, 4, 0.7, faction); limb(g, [[2, -8], [10, -8]], 1.6, '#8fe06a'); limb(g, [[6, -12], [6, -4]], 1.6, '#8fe06a'); }
      if (id === 'chop') weapon(g, 'axe', -2, 6, 0.4, faction);
      if (id === 'return') { drawCarry(g, 'gold', -2, 3); shape(g, [[2, -10], [10, -5], [2, 0], [2, -3], [-5, -3], [-5, -7], [2, -7]], '#8fe06a', 0.8); }
      if (id === 'cancel') { limb(g, [[-7, -7], [7, 7]], 3.4, '#ff5a46'); limb(g, [[7, -7], [-7, 7]], 3.4, '#ff5a46'); }
      if (id === 'weapon') { weapon(g, faction === 'orc' ? 'cleaver' : 'sword', -1, 7, 0.55, faction); shape(g, [[4, 8], [4, 2], [1, 2], [6, -4], [11, 2], [8, 2], [8, 8]], '#ffd84a', 0.8); }
      if (id === 'armor') { shape(g, [[-9, -8], [3, -8], [2, 2], [-3, 8], [-8, 2]], '#c9d2dc'); shape(g, [[4, 9], [4, 3], [1, 3], [6, -3], [11, 3], [8, 3], [8, 9]], '#ffd84a', 0.8); }
      if (id === 'arrow') { limb(g, [[-8, 8], [5, -5]], 1.4, '#c89a62'); shape(g, [[3, -9], [10, -10], [9, -3]], '#e8eef4', 0.9); limb(g, [[-8, 4], [-5, 7], [-4, 8]], 1.4, '#e8eef4'); }
    }
  });
}
