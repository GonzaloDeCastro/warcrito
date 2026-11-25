// Dibuja el estado del juego: terreno cacheado, sprites ordenados por altura, niebla y efectos.
class Renderer {
  constructor(game, canvas, mini, viewer) {
    this.g = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mini = mini;
    this.mctx = mini.getContext('2d');
    this.me = viewer;
    this.cam = { x: 0, y: 0, z: 1.25 };
    this.fx = [];
    this.corpses = [];
    this.rubble = [];
    this.ground = this.buildGround();
    this.fogCanvas = makeCanvas(MAPW, MAPH);
    this.fogData = this.fogCanvas.getContext('2d').createImageData(MAPW, MAPH);
    this.miniBase = makeCanvas(MAPW, MAPH);
    this.miniVersion = -1;
    this.fogShown = -1;
    this.clock = 0;
  }

  buildGround() {
    const g = this.g, S = TILE;
    const c = makeCanvas(MAPW * S, MAPH * S), x = c.getContext('2d');
    const rng = makeRng(99);
    const ter = (i, j) => i >= 0 && j >= 0 && i < MAPW && j < MAPH ? g.terrain[j * MAPW + i] : T_TREE;
    x.fillStyle = '#5b8c3e';
    x.fillRect(0, 0, c.width, c.height);
    // variación del pasto
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = ['rgba(120,170,70,0.20)', 'rgba(60,105,40,0.22)', 'rgba(150,170,80,0.14)'][i % 3];
      x.beginPath();
      x.ellipse(rng() * c.width, rng() * c.height, 12 + rng() * 46, 8 + rng() * 28, rng() * 3, 0, 7);
      x.fill();
    }
    const patch = (type, fill, grow) => {
      x.fillStyle = fill;
      for (let j = 0; j < MAPH; j++)
        for (let i = 0; i < MAPW; i++) {
          if (ter(i, j) !== type) continue;
          x.beginPath();
          x.ellipse(i * S + S / 2 + (rng() - 0.5) * 5, j * S + S / 2 + (rng() - 0.5) * 5, S * 0.5 + grow + rng() * 3, S * 0.5 + grow + rng() * 3, 0, 0, 7);
          x.fill();
        }
    };
    patch(T_DIRT, '#8a8447', 7);
    patch(T_DIRT, '#9c8854', 2);
    patch(T_TREE, '#3f6a30', 5);
    patch(T_STUMP, '#7c8445', 3);
    patch(T_ROCK, '#7d7b5e', 5);
    // agua con orilla de arena y espuma
    patch(T_WATER, '#c8b27a', 8);
    patch(T_WATER, '#d9efe6', 3.5);
    patch(T_WATER, '#3f8fb5', 1);
    patch(T_WATER, '#2f719c', -6);
    // briznas, flores y piedritas
    for (let i = 0; i < 5200; i++) {
      const px = rng() * c.width, py = rng() * c.height;
      const t = ter(Math.floor(px / S), Math.floor(py / S));
      if (t === T_WATER) continue;
      if (t === T_DIRT) {
        x.fillStyle = rng() < 0.5 ? '#b7a270' : '#75653f';
        x.fillRect(px, py, 2 + rng() * 2, 2);
      } else if (rng() < 0.05) {
        x.fillStyle = ['#f6e46a', '#f0f0f0', '#e98ab0'][i % 3];
        x.beginPath(); x.arc(px, py, 1.6, 0, 7); x.fill();
      } else {
        x.strokeStyle = rng() < 0.5 ? '#3f6e2b' : '#8fbd58';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(px, py); x.lineTo(px - 2, py - 4);
        x.moveTo(px + 2, py); x.lineTo(px + 3, py - 5);
        x.stroke();
      }
    }
    x.lineJoin = 'round';
    for (let j = 0; j < MAPH; j++)
      for (let i = 0; i < MAPW; i++) {
        const t = ter(i, j), px = i * S, py = j * S;
        if (t === T_ROCK) {
          const rock = (cx, cy, r) => {
            oval(x, cx + 3, cy + r * 0.5, r, r * 0.5, 'rgba(0,0,0,0.25)', 0);
            shape(x, [[cx - r, cy + r * 0.4], [cx - r * 0.7, cy - r * 0.5], [cx - r * 0.1, cy - r], [cx + r * 0.7, cy - r * 0.4], [cx + r, cy + r * 0.4], [cx, cy + r * 0.7]], '#8f8a80', 1.4);
            shape(x, [[cx - r * 0.7, cy - r * 0.5], [cx - r * 0.1, cy - r], [cx + r * 0.2, cy - r * 0.2], [cx - r * 0.5, cy]], '#b5b0a4', 0);
            shape(x, [[cx + r * 0.2, cy - r * 0.2], [cx + r * 0.7, cy - r * 0.4], [cx + r, cy + r * 0.4], [cx, cy + r * 0.7]], '#6d695f', 0);
          };
          rock(px + 10 + rng() * 4, py + 12 + rng() * 4, 11);
          rock(px + 21 + rng() * 4, py + 20 + rng() * 4, 12 + rng() * 3);
        }
        if (t === T_BRIDGE) {
          x.fillStyle = '#3a2817'; x.fillRect(px, py, S, S);
          for (let k = 0; k < 4; k++) {
            x.fillStyle = ['#9b6f42', '#8a6038', '#a87a49', '#93673d'][(i + j + k) % 4];
            x.fillRect(px + 0.5, py + k * 8 + 0.5, S - 1, 7);
          }
        }
      }
    return c;
  }

  // ───────── cámara ─────────
  clampCam() {
    const c = this.cam, vw = this.canvas.clientWidth / c.z, vh = this.canvas.clientHeight / c.z;
    const maxX = MAPW * TILE - vw, maxY = MAPH * TILE - vh;
    c.x = maxX < 0 ? maxX / 2 : Math.max(0, Math.min(maxX, c.x));
    c.y = maxY < 0 ? maxY / 2 : Math.max(0, Math.min(maxY, c.y));
  }
  centerOn(tx, ty) {
    this.cam.x = tx * TILE - this.canvas.clientWidth / this.cam.z / 2;
    this.cam.y = ty * TILE - this.canvas.clientHeight / this.cam.z / 2;
    this.clampCam();
  }
  toWorld(sx, sy) { return { x: this.cam.x + sx / this.cam.z, y: this.cam.y + sy / this.cam.z }; }

  visibleEnt(e) {
    const p = this.g.players[this.me];
    if (e.owner === this.me) return !e.hidden;
    if (e.hidden) return false;
    const w = e.kind === 'building' ? e.w : 1, h = e.kind === 'building' ? e.h : 1;
    const arr = e.kind === 'building' ? p.explored : p.visible;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (arr[(e.y + j) * MAPW + e.x + i]) return true;
    return false;
  }
  // Entidad bajo el puntero (coordenadas de mundo en píxeles)
  pick(wx, wy) {
    let best = null, by = -1e9;
    for (const e of this.g.list) {
      if (e.dead || !this.visibleEnt(e)) continue;
      if (e.kind === 'unit') {
        const x = (e.px + 0.5) * TILE, y = (e.py + 0.9) * TILE;
        const r = e.type === 'siege' || e.type === 'cavalry' ? 18 : 13;
        if (Math.abs(wx - x) < r && wy < y + 4 && wy > y - 34 && y > by) { best = e; by = y; }
      }
    }
    if (best) return best;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (!this.g.inb(tx, ty)) return null;
    const id = this.g.bld[ty * MAPW + tx];
    const b = id && this.g.get(id);
    return b && this.visibleEnt(b) ? b : null;
  }

  // ───────── efectos ─────────
  addFx(type, x, y, extra) { this.fx.push(Object.assign({ type, x: x * TILE, y: y * TILE, t: 0 }, extra)); }
  particles(x, y, n, color, speed, life, grav = 0, size = 2.4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = speed * (0.3 + Math.random() * 0.7);
      this.fx.push({ type: 'p', x: x * TILE, y: y * TILE - 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, t: 0, life: life * (0.6 + Math.random() * 0.6), color, grav, size });
    }
  }
  onEvent(ev) {
    const p = this.g.players[this.me];
    if (ev.x !== undefined && this.g.inb(Math.floor(ev.x), Math.floor(ev.y)) && !p.visible[Math.floor(ev.y) * MAPW + Math.floor(ev.x)]) return;
    if (ev.type === 'hit') this.particles(ev.x, ev.y, ev.big ? 8 : 5, '#fff0b0', 60, 0.3);
    if (ev.type === 'chop') this.particles(ev.x, ev.y, 4, '#d6ae74', 45, 0.4, 160);
    if (ev.type === 'boom') { this.addFx('boom', ev.x, ev.y); this.particles(ev.x, ev.y, 16, '#8a7a62', 110, 0.6, 220, 3.4); }
    if (ev.type === 'heal') this.addFx('heal', ev.x, ev.y);
    if (ev.type === 'fury') this.addFx('fury', ev.x, ev.y);
    if (ev.type === 'death') {
      this.particles(ev.x, ev.y, 10, ev.utype === 'siege' ? '#a5733f' : '#a5201a', 70, 0.5, 200);
      this.corpses.push({ x: ev.x * TILE, y: ev.y * TILE, t: 0, faction: ev.faction, utype: ev.utype });
    }
    if (ev.type === 'collapse') {
      this.addFx('boom', ev.x, ev.y, { big: true });
      this.particles(ev.x, ev.y, 40, '#8a7a62', 150, 0.9, 220, 4);
      this.rubble.push({ x: ev.x * TILE, y: ev.y * TILE, w: ev.w * TILE, h: ev.h * TILE, t: 0, seed: Math.floor(ev.x * 31 + ev.y) });
    }
  }
  update(dt) {
    this.clock += dt;
    for (const f of this.fx) {
      f.t += dt;
      if (f.type === 'p') { f.vy += f.grav * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    }
    this.fx = this.fx.filter(f => f.t < (f.life || (f.type === 'order' ? 0.6 : 0.7)));
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter(c => c.t < 12);
    for (const c of this.rubble) c.t += dt;
    this.rubble = this.rubble.filter(c => c.t < 25);
  }

  // ───────── dibujo ─────────
  draw(ui) {
    const ctx = this.ctx, g = this.g, cam = this.cam;
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
      this.clampCam();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = cam.z * dpr;
    ctx.setTransform(k, 0, 0, k, Math.round(-cam.x * k), Math.round(-cam.y * k));
    ctx.drawImage(this.ground, 0, 0);

    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 2), y0 = Math.max(0, Math.floor(cam.y / TILE) - 2);
    const x1 = Math.min(MAPW - 1, Math.ceil((cam.x + cw / cam.z) / TILE) + 2), y1 = Math.min(MAPH - 1, Math.ceil((cam.y + ch / cam.z) / TILE) + 3);
    const seen = g.players[this.me].explored;

    // brillo del agua
    ctx.strokeStyle = 'rgba(220,245,255,0.45)';
    ctx.lineWidth = 1.2;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (g.terrain[y * MAPW + x] !== T_WATER || (x * 7 + y * 13) % 5) continue;
        const ph = (this.clock * 0.5 + (x * 3 + y) * 0.17) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI);
        ctx.beginPath();
        ctx.moveTo(x * TILE + 6 + ph * 8, y * TILE + 16);
        ctx.quadraticCurveTo(x * TILE + 12 + ph * 8, y * TILE + 12, x * TILE + 18 + ph * 8, y * TILE + 16);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;

    // escombros y caídos
    for (const r of this.rubble) {
      const rng = makeRng(r.seed);
      ctx.globalAlpha = Math.min(1, (25 - r.t) / 5);
      oval(ctx, r.x, r.y, r.w * 0.45, r.h * 0.34, 'rgba(40,30,20,0.55)', 0);
      for (let i = 0; i < r.w / 4; i++) {
        const px = r.x + (rng() - 0.5) * r.w * 0.75, py = r.y + (rng() - 0.5) * r.h * 0.55;
        box(ctx, px, py, 4 + rng() * 8, 3 + rng() * 5, rng() < 0.5 ? '#6e655a' : '#5d4025', 0.8);
      }
    }
    for (const c of this.corpses) {
      ctx.globalAlpha = Math.min(1, (12 - c.t) / 4);
      if (c.utype === 'siege') {
        box(ctx, c.x - 14, c.y - 2, 22, 5, '#6e4a2a', 1);
        oval(ctx, c.x + 10, c.y + 2, 6, 4, '#4f3119', 1);
      } else {
        oval(ctx, c.x, c.y + 6, 12, 6, 'rgba(120,20,15,0.6)', 0);
        oval(ctx, c.x - 2, c.y + 4, 8, 3.6, FACTIONS[c.faction].dark, 1);
        oval(ctx, c.x + 8, c.y + 3, 3.8, 3.4, c.faction === 'orc' ? '#6aa83f' : '#f0bd8d', 1);
      }
    }
    ctx.globalAlpha = 1;

    // selección en el suelo
    const sel = ui.selection;
    for (const e of sel) {
      if (e.dead || e.hidden) continue;
      const own = e.owner === this.me ? '#6dff5a' : e.owner < 0 ? '#ffe14a' : '#ff5a46';
      ctx.strokeStyle = own;
      ctx.lineWidth = 1.6;
      if (e.kind === 'unit') {
        ctx.beginPath();
        ctx.ellipse((e.px + 0.5) * TILE, (e.py + 0.8) * TILE, e.type === 'siege' || e.type === 'cavalry' ? 18 : 12, e.type === 'siege' || e.type === 'cavalry' ? 9 : 6.5, 0, 0, 7);
        ctx.stroke();
      } else {
        ctx.strokeRect(e.x * TILE + 1, e.y * TILE + 1, e.w * TILE - 2, e.h * TILE - 2);
        if (e.rally && e.owner === this.me) {
          const rx = (e.rally.x + 0.5) * TILE, ry = (e.rally.y + 0.5) * TILE;
          banner(ctx, rx, ry - 18, g.players[this.me].faction, 18);
        }
      }
    }

    // sprites ordenados por altura
    const items = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const t = g.terrain[y * MAPW + x];
        if (t === T_TREE) items.push({ y: y * TILE + 28, tree: true, tx: x, ty: y });
        else if (t === T_STUMP) ctx.drawImage(stumpSprite(), x * TILE, y * TILE, TILE, TILE);
      }
    for (const e of g.list) {
      if (e.dead || !this.visibleEnt(e)) continue;
      if (e.kind === 'unit') {
        if (e.px < x0 - 1 || e.px > x1 + 1 || e.py < y0 - 1 || e.py > y1 + 1) continue;
        items.push({ y: e.py * TILE + 27, e });
      } else {
        if (e.x + e.w < x0 || e.x > x1 || e.y + e.h < y0 || e.y > y1 + 1) continue;
        items.push({ y: (e.y + e.h) * TILE - 10, e });
      }
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.tree) {
        const h = (it.tx * 73 + it.ty * 151) % 97;
        ctx.drawImage(treeSprite(h % 6), it.tx * TILE - 8 + (h % 5) - 2, it.ty * TILE - 24 + (h % 7) - 3, 48, 60);
      } else if (it.e.kind === 'unit') this.drawUnit(it.e);
      else this.drawBuilding(it.e);
    }

    this.drawProjectiles();
    this.drawFx();
    this.drawFog(ctx);
    this.drawBars(ui);

    // fantasma del edificio a colocar
    if (ui.placing && ui.mouse.inside) {
      const d = BUILDINGS[ui.placing];
      const w = this.toWorld(ui.mouse.x, ui.mouse.y);
      const tx = Math.round(w.x / TILE - d.w / 2), ty = Math.round(w.y / TILE - d.h / 2);
      ctx.globalAlpha = 0.65;
      const spr = buildingSprite(g.players[this.me].faction, ui.placing, 2);
      ctx.drawImage(spr, tx * TILE - 8, ty * TILE - BTOP, spr.width / ART_RES, spr.height / ART_RES);
      ctx.globalAlpha = 1;
      const ids = new Set(sel.map(s => s.id));
      for (let j = 0; j < d.h; j++)
        for (let i = 0; i < d.w; i++) {
          const cx = tx + i, cy = ty + j;
          let ok = g.walkable(cx, cy) && g.terrain[cy * MAPW + cx] !== T_BRIDGE && seen[cy * MAPW + cx];
          if (ok && g.occ[cy * MAPW + cx]) ok = g.list.some(u => u.kind === 'unit' && ids.has(u.id) && u.x === cx && u.y === cy);
          ctx.fillStyle = ok ? 'rgba(80,255,80,0.28)' : 'rgba(255,50,30,0.4)';
          ctx.fillRect(cx * TILE + 1, cy * TILE + 1, TILE - 2, TILE - 2);
        }
    }

    // caja de selección
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ui.drag && ui.drag.active) {
      const m = ui.mouse, d = ui.drag;
      ctx.fillStyle = 'rgba(110,255,90,0.12)';
      ctx.strokeStyle = '#6dff5a';
      ctx.lineWidth = 1;
      ctx.fillRect(d.x, d.y, m.x - d.x, m.y - d.y);
      ctx.strokeRect(d.x + 0.5, d.y + 0.5, m.x - d.x, m.y - d.y);
    }
  }

  drawUnit(u) {
    const ctx = this.ctx, p = this.g.players[u.owner];
    const x = (u.px + 0.5) * TILE, y = (u.py + 0.85) * TILE;
    let view = 'front', flip = false;
    if (u.dirx !== 0) { view = 'side'; flip = u.dirx < 0; }
    else if (u.diry < 0) view = 'back';
    let frame = 0;
    if (u.attackT > 0) frame = u.attackT > 0.22 ? 3 : 4;
    else if (u.moving) frame = [1, 0, 2, 0][Math.floor(u.walkT * 9) % 4];
    const big = u.type === 'siege' || u.type === 'cavalry';
    oval(ctx, x + 2, y, big ? 15 : 9, big ? 6 : 4, 'rgba(0,0,0,0.3)', 0);
    // anillo de bando
    ctx.strokeStyle = FACTIONS[p.faction].light;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(x, y, big ? 15 : 10, big ? 7 : 5, 0, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    if (u.buffT > 0) {
      ctx.fillStyle = `rgba(255,60,30,${0.25 + 0.15 * Math.sin(this.clock * 12)})`;
      ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 17, 0, 0, 7); ctx.fill();
    }
    const spr = unitSprite(p.faction, u.type, view, frame, flip);
    const dy = !u.moving && !frame ? Math.sin(this.clock * 2.4 + u.id) * 0.5 : 0;
    if (u.carry && view === 'back') { ctx.drawImage(spr, x - USPR.ax, y - USPR.ay + dy, USPR.w, USPR.h); drawCarry(ctx, u.carry.type, x, y - 15); }
    else {
      if (u.carry) drawCarry(ctx, u.carry.type, x - (view === 'side' ? (flip ? -8 : 8) : 8), y - 17);
      ctx.drawImage(spr, x - USPR.ax, y - USPR.ay + dy, USPR.w, USPR.h);
    }
    if (u.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x, y - 14, 5, 0, 7); ctx.fill();
    }
  }

  drawBuilding(b) {
    const ctx = this.ctx;
    const faction = b.owner >= 0 ? this.g.players[b.owner].faction : 'human';
    const stage = b.done ? 2 : b.progress < 0.5 ? 0 : 1;
    const spr = buildingSprite(faction, b.type, stage);
    ctx.drawImage(spr, b.x * TILE - 8, b.y * TILE - BTOP, spr.width / ART_RES, spr.height / ART_RES);
    if (b.type === 'mine' && b.busy > 0) {
      ctx.fillStyle = `rgba(255,190,60,${0.35 + 0.2 * Math.sin(this.clock * 9)})`;
      ctx.beginPath(); ctx.ellipse(b.x * TILE + 49, (b.y + b.h) * TILE - 22, 12, 14, 0, 0, 7); ctx.fill();
    }
    // fuego cuando está dañado (solo si se ve ahora)
    const seeNow = this.g.players[this.me].visible[b.y * MAPW + b.x];
    const frac = b.hp / BUILDINGS[b.type].hp;
    if (b.done && b.owner >= 0 && frac < 0.6 && (seeNow || b.owner === this.me)) {
      const n = frac < 0.3 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const fx = b.x * TILE + b.w * TILE * (0.2 + ((i * 37 + b.id * 13) % 60) / 100);
        const fy = b.y * TILE + b.h * TILE * (0.3 + ((i * 53 + b.id * 7) % 45) / 100);
        const f = Math.sin(this.clock * 11 + i * 2) * 3;
        shape(ctx, [[fx - 7, fy], [fx - 3, fy - 8], [fx, fy - 18 - f], [fx + 3, fy - 8], [fx + 7, fy]], '#ff7a1e', 0);
        shape(ctx, [[fx - 3.5, fy], [fx, fy - 9 + f * 0.5], [fx + 3.5, fy]], '#ffe35a', 0);
        const s = (this.clock * 0.7 + i * 0.37) % 1;
        oval(ctx, fx + s * 8, fy - 18 - s * 26, 4 + s * 7, 4 + s * 6, `rgba(50,45,40,${0.45 * (1 - s)})`, 0);
      }
    }
    if (b.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x * TILE + 4, b.y * TILE + 4, b.w * TILE - 8, b.h * TILE - 8);
    }
  }

  drawProjectiles() {
    const ctx = this.ctx, vis = this.g.players[this.me].visible;
    for (const p of this.g.projectiles) {
      const k = Math.min(1, p.t / p.dur);
      const x = p.x0 + (p.tx - p.x0) * k, y = p.y0 + (p.ty - p.y0) * k;
      const i = Math.floor(y) * MAPW + Math.floor(x);
      if (!vis[i] && p.owner !== this.me) continue;
      const arc = p.kind === 'rock' ? 1.8 : p.kind === 'orb' ? 0 : 0.3;
      const px = x * TILE, py = (y - Math.sin(k * Math.PI) * arc) * TILE;
      ctx.save();
      ctx.translate(px, py);
      if (p.kind === 'rock') {
        oval(ctx, 0, (y * TILE - py), 6, 3, 'rgba(0,0,0,0.3)', 0);
        ctx.rotate(p.t * 9);
        shape(ctx, [[-5, -3], [0, -6], [5, -2], [4, 4], [-3, 5]], '#8b8d90', 1.2);
      } else if (p.kind === 'orb') {
        const c = this.g.players[p.owner].faction === 'orc' ? '61,255,106' : '255,227,138';
        oval(ctx, 0, 0, 7, 7, `rgba(${c},0.35)`, 0);
        oval(ctx, 0, 0, 3.2, 3.2, `rgb(${c})`, 0);
      } else if (p.kind === 'axe') {
        ctx.rotate(p.t * 18 * (p.tx < p.x0 ? -1 : 1));
        weapon(ctx, 'axe', 0, 4, 0, 'orc');
      } else {
        const slope = Math.cos(k * Math.PI) * arc * Math.PI;
        ctx.rotate(Math.atan2((p.ty - p.y0) - slope, p.tx - p.x0));
        limb(ctx, [[-9, 0], [3, 0]], 1, '#c89a62');
        shape(ctx, [[3, -2.4], [8, 0], [3, 2.4]], '#e8eef4', 0.7);
        shape(ctx, [[-9, 0], [-12, -2.6], [-7, 0], [-12, 2.6]], '#f0f0f0', 0);
      }
      ctx.restore();
    }
  }

  drawFx() {
    const ctx = this.ctx;
    for (const f of this.fx) {
      if (f.type === 'p') {
        ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
      } else if (f.type === 'boom') {
        const k = f.t / 0.7, s = f.big ? 2.6 : 1;
        ctx.globalAlpha = 1 - k;
        oval(ctx, f.x, f.y - 6, (8 + k * 26) * s, (6 + k * 20) * s, '#c9a878', 0);
        oval(ctx, f.x, f.y - 8, (6 + k * 10) * s, (5 + k * 8) * s, '#ffb347', 0);
      } else if (f.type === 'heal' || f.type === 'fury') {
        const k = f.t / 0.7;
        ctx.globalAlpha = 1 - k;
        const color = f.type === 'heal' ? '#fff3a0' : '#ff4a2a';
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + 8 - k * 14, 12, 6, 0, 0, 7); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const x = f.x - 12 + i * 8, y = f.y - (k * 24) - (i % 2) * 7;
          ctx.fillStyle = color;
          ctx.fillRect(x - 1, y - 4, 2, 8); ctx.fillRect(x - 4, y - 1, 8, 2);
        }
      } else if (f.type === 'order') {
        const k = f.t / 0.6;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 15 * (1 - k) + 4, 8 * (1 - k) + 2, 0, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawBars(ui) {
    const ctx = this.ctx;
    const selected = new Set(ui.selection.map(e => e.id));
    for (const e of this.g.list) {
      if (e.dead || e.type === 'mine' || !this.visibleEnt(e)) continue;
      if (e.kind === 'building' && e.owner !== this.me) {
        if (!this.g.players[this.me].visible[e.y * MAPW + e.x]) continue;
      }
      const max = this.g.maxHp(e), frac = Math.max(0, e.hp / max);
      const sel = selected.has(e.id);
      if (!sel && frac >= 1 && !ui.showBars && (e.kind === 'unit' || e.done)) continue;
      let x, y, w;
      if (e.kind === 'unit') {
        w = e.type === 'siege' || e.type === 'cavalry' ? 28 : 20;
        x = (e.px + 0.5) * TILE - w / 2;
        y = (e.py + 0.85) * TILE - (e.type === 'cavalry' ? 46 : e.type === 'siege' ? 34 : 35);
      } else {
        w = e.w * TILE * 0.7;
        x = (e.x + e.w / 2) * TILE - w / 2;
        y = e.y * TILE - 8;
      }
      ctx.fillStyle = '#120d09';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = frac > 0.6 ? '#4fd13a' : frac > 0.3 ? '#f0c419' : '#e8432e';
      ctx.fillRect(x, y, w * frac, 3);
      if (e.kind === 'building' && !e.done) {
        ctx.fillStyle = '#120d09'; ctx.fillRect(x - 1, y + 5, w + 2, 5);
        ctx.fillStyle = '#7fc4ff'; ctx.fillRect(x, y + 6, w * e.progress, 3);
      }
    }
  }

  drawFog(ctx) {
    const p = this.g.players[this.me];
    const d = this.fogData.data;
    for (let i = 0; i < MAPW * MAPH; i++) {
      const a = p.visible[i] ? 0 : p.explored[i] ? 120 : 255;
      d[i * 4] = 8; d[i * 4 + 1] = 7; d[i * 4 + 2] = 10; d[i * 4 + 3] = a;
    }
    this.fogCanvas.getContext('2d').putImageData(this.fogData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, 0, 0, MAPW * TILE, MAPH * TILE);
  }

  drawMini(pings) {
    const g = this.g;
    if (this.miniVersion !== g.treeVersion) {
      this.miniVersion = g.treeVersion;
      const x = this.miniBase.getContext('2d');
      const cols = ['#5b8c3e', '#2c5527', '#2f719c', '#8f8a80', '#9c8854', '#6f8440', '#9b6f42'];
      for (let i = 0; i < MAPW * MAPH; i++) {
        x.fillStyle = cols[g.terrain[i]];
        x.fillRect(i % MAPW, (i / MAPW) | 0, 1, 1);
      }
    }
    const ctx = this.mctx, W = this.mini.width, s = W / MAPW;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, W, W);
    const p = g.players[this.me];
    for (const e of g.list) {
      if (e.dead || !this.visibleEnt(e)) continue;
      ctx.fillStyle = e.type === 'mine' ? '#ffd23a' : e.owner === this.me ? '#6dff5a' : FACTIONS[g.players[e.owner].faction].color;
      if (e.owner >= 0 && e.owner !== this.me) ctx.fillStyle = '#ff4030';
      if (e.kind === 'building') ctx.fillRect(e.x * s, e.y * s, e.w * s, e.h * s);
      else ctx.fillRect(e.px * s - 0.5, e.py * s - 0.5, s + 1, s + 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, 0, 0, W, W);
    for (const q of pings) {
      const k = (q.t * 2) % 1;
      ctx.strokeStyle = '#ff3a28'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x * s, q.y * s, 3 + k * 10, 0, 7); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    const c = this.cam;
    ctx.strokeRect(c.x / TILE * s, c.y / TILE * s, this.canvas.clientWidth / c.z / TILE * s, this.canvas.clientHeight / c.z / TILE * s);
  }
}
