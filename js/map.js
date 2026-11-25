// Generador de mapas con simetría central (justo para los dos bandos).
const MAPS = {
  valle:  { name: 'Valle Verde', desc: 'Campo abierto con bosques y lagunas. Ideal para empezar.' },
  rio:    { name: 'El Río Partido', desc: 'Un río divide el mapa: solo se cruza por tres puentes.' },
  bosque: { name: 'Bosque Cerrado', desc: 'Pasos angostos entre árboles. Buena defensa, mucha madera.' },
};

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMap(id, seed) {
  const rng = makeRng(seed);
  const t = new Uint8Array(MAPW * MAPH);
  const inb = (x, y) => x >= 0 && y >= 0 && x < MAPW && y < MAPH;
  // Todo lo que se pinta se espeja respecto del centro
  const set = (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (!inb(x, y)) return;
    t[y * MAPW + x] = v;
    t[(MAPH - 1 - y) * MAPW + (MAPW - 1 - x)] = v;
  };
  const blob = (cx, cy, r, v) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
        if (Math.hypot(x - cx, y - cy) <= r + (rng() - 0.5) * 1.6) set(x, y, v);
  };

  // Manchas de tierra decorativas
  for (let i = 0; i < 26; i++) blob(rng() * MAPW, rng() * MAPH, 1 + rng() * 2.5, T_DIRT);

  // Borde de bosque
  for (let x = 0; x < MAPW; x++) {
    const d = 1 + Math.floor(rng() * 3);
    for (let y = 0; y < d; y++) set(x, y, T_TREE);
  }
  for (let y = 0; y < MAPH; y++) {
    const d = 1 + Math.floor(rng() * 3);
    for (let x = 0; x < d; x++) set(x, y, T_TREE);
  }

  const bases = [{ x: 8, y: MAPH - 13 }, { x: MAPW - 12, y: 9 }];

  const forests = id === 'bosque' ? 62 : id === 'rio' ? 24 : 30;
  for (let i = 0; i < forests; i++) blob(rng() * MAPW, rng() * MAPH, 1.2 + rng() * (id === 'bosque' ? 3.4 : 2.4), T_TREE);
  for (let i = 0; i < 7; i++) blob(10 + rng() * (MAPW - 20), 10 + rng() * (MAPH - 20), 0.7 + rng() * 1.2, T_ROCK);

  if (id === 'valle') {
    blob(24, 28, 3.6, T_WATER);
    blob(36, 36, 2.6, T_WATER);
  }
  if (id === 'rio') {
    // Río en la diagonal que separa las dos bases
    for (let x = 0; x < MAPW; x++)
      for (let y = 0; y < MAPH; y++) {
        const d = (x - y) + Math.sin((x + y - MAPW + 1) / 7) * 3 * Math.sign(x + y - MAPW + 1);
        if (Math.abs(d) <= 3.4) t[y * MAPW + x] = T_WATER;
      }
    for (const c of [14, 36]) {
      for (let k = -8; k <= 8; k++)
        for (let w = -1; w <= 1; w++) {
          const x = c + k, y = c - k + w;
          if (!inb(x, y)) continue;
          const v = t[y * MAPW + x] === T_WATER ? T_BRIDGE : T_DIRT;
          set(x, y, v);
        }
    }
  }

  // Claros de las bases
  for (const b of bases.slice(0, 1)) {
    blob(b.x + 2, b.y + 2, 9, T_GRASS);
    blob(b.x + 2, b.y + 2, 4, T_DIRT);
    // Bosque propio a mano
    blob(b.x + 12, b.y + 8, 3.4, T_TREE);
    blob(b.x - 6, b.y - 5, 2.8, T_TREE);
  }

  // Minas: principal de cada base y dos de expansión por lado
  const mineSpots = [
    { x: 2 + 2, y: MAPH - 8, gold: 14000 },
    { x: 7, y: 30, gold: 16000 },
    { x: 30, y: MAPH - 10, gold: 14000 },
  ];
  mineSpots[0] = { x: bases[0].x + 8, y: bases[0].y - 3, gold: 14000 };
  const mines = [];
  for (const m of mineSpots) {
    for (let y = -2; y < 5; y++)
      for (let x = -2; x < 5; x++) {
        const px = m.x + x, py = m.y + y;
        if (inb(px, py) && t[py * MAPW + px] !== T_DIRT) set(px, py, T_GRASS);
      }
    mines.push(m);
    mines.push({ x: MAPW - m.x - 3, y: MAPH - m.y - 3, gold: m.gold });
  }

  // Garantizar caminos entre las bases y hacia todas las minas
  const walk = v => v !== T_TREE && v !== T_WATER && v !== T_ROCK;
  const start = { x: bases[0].x + 2, y: bases[0].y + 5 };
  const reach = () => {
    const seen = new Uint8Array(MAPW * MAPH);
    const q = [start.y * MAPW + start.x];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % MAPW, y = (i / MAPW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * MAPW + nx;
        if (inb(nx, ny) && !seen[j] && walk(t[j])) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  const carve = (ax, ay, bx, by) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) + 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n);
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          if (!inb(x + dx, y + dy)) continue;
          const v = t[(y + dy) * MAPW + x + dx];
          if (v === T_WATER) set(x + dx, y + dy, T_BRIDGE);
          else if (!walk(v)) set(x + dx, y + dy, T_DIRT);
        }
    }
  };
  const targets = mines.map(m => ({ x: m.x + 1, y: m.y + 3 }));
  targets.push({ x: bases[1].x + 2, y: bases[1].y + 5 });
  for (const g of targets) {
    if (!reach()[g.y * MAPW + g.x]) carve(g.x, g.y, MAPW >> 1, MAPH >> 1);
    if (!reach()[g.y * MAPW + g.x]) carve(start.x, start.y, MAPW >> 1, MAPH >> 1);
    if (!reach()[g.y * MAPW + g.x]) carve(g.x, g.y, start.x, start.y);
  }

  return { terrain: t, bases, mines };
}
