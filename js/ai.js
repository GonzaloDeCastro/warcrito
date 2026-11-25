// Rival controlado por la computadora. Usa las mismas órdenes que el jugador.
const AI_LEVELS = {
  easy:   { name: 'Fácil',   workers: 9,  think: 2.0, firstAttack: 480, wave: 5, grow: 2, maxArmy: 14, bonus: 1.0,  towers: 1 },
  normal: { name: 'Normal',  workers: 13, think: 1.2, firstAttack: 340, wave: 7, grow: 3, maxArmy: 24, bonus: 1.0,  towers: 2 },
  hard:   { name: 'Difícil', workers: 17, think: 0.7, firstAttack: 260, wave: 9, grow: 4, maxArmy: 36, bonus: 1.25, towers: 3 },
};

class AI {
  constructor(game, owner, level) {
    this.g = game;
    this.owner = owner;
    this.cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    this.t = 1;
    this.wave = this.cfg.wave;
    this.nextAttack = this.cfg.firstAttack;
    this.attackers = new Set();
    if (this.cfg.bonus !== 1) game.players[owner].bonus = this.cfg.bonus;
    // La computadora conoce el terreno
    game.players[owner].explored.fill(1);
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0 || this.g.winner !== null) return;
    this.t = this.cfg.think;
    const g = this.g, me = this.owner;
    const mine = g.list.filter(e => !e.dead && e.owner === me);
    const units = mine.filter(e => e.kind === 'unit');
    const blds = mine.filter(e => e.kind === 'building');
    const count = (type) => blds.filter(b => b.type === type).length;
    const workers = units.filter(u => u.type === 'worker');
    const army = units.filter(u => u.type !== 'worker');
    const hall = blds.find(b => b.type === 'hall' && b.done) || blds.find(b => b.type === 'hall') || blds[0];
    if (!hall) return;

    this.economy(workers, blds, hall);
    this.construct(workers, blds, hall, count);
    this.production(workers, army, blds, count);
    this.military(army, hall, workers);
  }

  economy(workers, blds, hall) {
    const g = this.g, p = g.players[this.owner];
    const jobs = { gold: 0, wood: 0 };
    for (const w of workers) {
      const o = w.order;
      if (!o) continue;
      const h = o.type === 'harvest' ? o : o.type === 'return' ? o.next : null;
      if (h) jobs[h.res]++;
    }
    for (const w of workers) {
      if (w.order || w.hidden) continue;
      let res = jobs.gold <= jobs.wood * 1.4 ? 'gold' : 'wood';
      if (p.wood > p.gold + 400) res = 'gold';
      if (p.gold > p.wood + 600) res = 'wood';
      if (res === 'gold') {
        // una mina que tenga un ayuntamiento propio cerca
        let m = null;
        for (const h of blds) {
          if (h.type !== 'hall' || !h.done) continue;
          const c = g.nearestMine(h.x + 2, h.y + 2, 14);
          if (c && (!m || Math.hypot(c.x - w.x, c.y - w.y) < Math.hypot(m.x - w.x, m.y - w.y))) m = c;
        }
        if (!m) m = g.nearestMine(hall.x + 2, hall.y + 2, 34);
        if (m) { g.cmdMine(this.owner, [w.id], m.id); jobs.gold++; continue; }
        res = 'wood';
      }
      const t = g.nearestTree(w.x, w.y, 2500);
      if (t) { g.cmdChop(this.owner, [w.id], t.x, t.y); jobs.wood++; }
    }
    if (workers.length < this.cfg.workers && hall.done && hall.queue.length === 0) g.cmdTrain(this.owner, hall.id, 'worker');
  }

  builder(workers) {
    return workers.find(w => !w.hidden && (!w.order || (w.order.type === 'harvest' && w.order.res === 'wood')))
      || workers.find(w => !w.hidden && (!w.order || w.order.type !== 'build'));
  }
  findSite(type, near) {
    const g = this.g, d = BUILDINGS[type];
    // Deja un pasillo de una casilla alrededor para no encerrarse
    const clear = (x, y) => {
      if (!g.canPlace(type, x, y, this.owner, 0)) return false;
      for (let j = -1; j <= d.h; j++)
        for (let i = -1; i <= d.w; i++) {
          if (i >= 0 && j >= 0 && i < d.w && j < d.h) continue;
          const cx = x + i, cy = y + j;
          if (!g.inb(cx, cy) || g.bld[cy * MAPW + cx]) return false;
        }
      return true;
    };
    const cx = near.x + (near.w || 1) / 2, cy = near.y + (near.h || 1) / 2;
    for (let r = 3; r < 22; r++) {
      const cands = [];
      for (let k = 0; k < 24; k++) {
        const a = g.rng() * Math.PI * 2;
        cands.push({ x: Math.round(cx + Math.cos(a) * r - d.w / 2), y: Math.round(cy + Math.sin(a) * r - d.h / 2) });
      }
      const ok = cands.find(c => clear(c.x, c.y));
      if (ok) return ok;
    }
    return null;
  }

  construct(workers, blds, hall, count) {
    const g = this.g, me = this.owner, p = g.players[me];
    // Retomar obras abandonadas no es posible: el obrero queda adentro hasta terminar
    if (workers.some(w => w.order && w.order.type === 'build' && !w.order.started)) return;
    const pendingFarm = blds.some(b => b.type === 'farm' && !b.done);
    let want = null, near = hall;
    
    if (!count('hall')) want = 'hall';
    else if (p.cap < MAX_FOOD && p.cap - p.food <= 3 && !pendingFarm) want = 'farm';
    else if (!count('barracks')) want = 'barracks';
    else if (!count('mill')) want = 'mill';
    else if (!count('smith') && workers.length >= 8) want = 'smith';
    else if (count('tower') < this.cfg.towers && g.time > 150) want = 'tower';
    else if (count('barracks') < 2 && p.gold > 600) want = 'barracks';
    else if (!count('stable') && count('smith') && g.time > 200) want = 'stable';
    else if (!count('temple') && g.time > 240) want = 'temple';

    // Expandirse cuando se acaba el oro cercano
    this.saving = false;
    const supplied = blds.some(b => b.type === 'hall' && g.nearestMine(b.x + 2, b.y + 2, 14)?.gold >= 5000);
    if (!supplied && count('hall') && want !== 'farm') {
      const far = g.list.filter(e => !e.dead && e.type === 'mine' && e.gold >= 5000)
        .filter(e => !g.list.some(b => !b.dead && b.type === 'hall' && b.owner !== me && Math.hypot(b.x - e.x, b.y - e.y) < 14))
        .sort((a, b) => Math.hypot(a.x - hall.x, a.y - hall.y) - Math.hypot(b.x - hall.x, b.y - hall.y))[0];
      if (far) {
        want = 'hall'; near = far;
        // juntar para el ayuntamiento antes de gastar en el ejército
        this.saving = !g.canPay(me, BUILDINGS.hall.gold, BUILDINGS.hall.wood);
      }
    }
    if (!want) return;
    const d = BUILDINGS[want];
    if (g.missing(me, d.needs).length || !g.canPay(me, d.gold, d.wood)) return;
    const w = this.builder(workers);
    if (!w) return;
    const site = this.findSite(want, near);
    if (site) g.cmdBuild(me, w.id, want, site.x, site.y);
  }

  production(workers, army, blds, count) {
    const g = this.g, me = this.owner, p = g.players[me];
    const queued = blds.reduce((n, b) => n + b.queue.filter(q => q.kind === 'unit' && b.type !== 'hall').length, 0);
    const n = {};
    for (const u of army) n[u.type] = (n[u.type] || 0) + 1;
    // guardar para la granja o la expansión
    if (p.cap - p.food <= 0) return;
    if (this.saving && army.length >= 6) return;
    for (const b of blds) {
      if (!b.done || b.queue.length) continue;
      if (b.type === 'barracks' && army.length + queued < this.cfg.maxArmy) {
        let type = 'melee';
        const melee = (n.melee || 0) + (n.cavalry || 0);
        if (!g.missing(me, UNITS.siege.needs).length && (n.siege || 0) < Math.floor(army.length / 8)) type = 'siege';
        else if (!g.missing(me, UNITS.ranged.needs).length && (n.ranged || 0) < melee * 0.7) type = 'ranged';
        else if (!g.missing(me, UNITS.cavalry.needs).length && p.gold >= 220 && p.wood >= 60) type = 'cavalry';
        g.cmdTrain(me, b.id, type);
      }
      if (b.type === 'temple' && (n.caster || 0) < 1 + Math.floor(army.length / 10)) g.cmdTrain(me, b.id, 'caster');
      if ((b.type === 'smith' || b.type === 'mill') && army.length >= 5) {
        for (const k in UPGRADES)
          if (UPGRADES[k].at === b.type && p.upg[k] < UPGRADES[k].max && !p.researching[k]
            && p.gold > UPGRADES[k].gold[p.upg[k]] + 150) { g.cmdResearch(me, b.id, k); break; }
      }
    }
    // Reparar
    const broken = blds.find(b => b.done && b.hp < BUILDINGS[b.type].hp * 0.6);
    if (broken && p.gold > 100 && p.wood > 100 && !workers.some(w => w.order && w.order.type === 'repair')) {
      const w = this.builder(workers);
      if (w) g.cmdRepair(me, [w.id], broken.id);
    }
  }

  military(army, hall, workers) {
    const g = this.g, me = this.owner, p = g.players[me];
    const enemy = 1 - me;
    // Defender la base
    if (p.attackedAt !== undefined && g.time - p.attackedAt < 4) {
      const at = p.attackedPos;
      if (Math.hypot(at.x - hall.x, at.y - hall.y) < 20) {
        const defenders = army.filter(u => !this.attackers.has(u.id) && (!u.order || u.order.type === 'move'));
        if (defenders.length) g.cmdMove(me, defenders.map(u => u.id), Math.floor(at.x), Math.floor(at.y), true);
        return;
      }
    }
    const ready = army.filter(u => !this.attackers.has(u.id));
    const foodFull = p.food >= MAX_FOOD - 4;
    if (g.time >= this.nextAttack && (ready.length >= this.wave || foodFull)) {
      for (const u of ready) this.attackers.add(u.id);
      this.nextAttack = g.time + 75;
      this.wave = Math.min(this.wave + this.cfg.grow, this.cfg.maxArmy);
      g.emit('wave', { owner: enemy });
    }
    // Mantener en marcha a los que atacan
    const idle = [];
    for (const id of this.attackers) {
      const u = g.get(id);
      if (!u) { this.attackers.delete(id); continue; }
      if (!u.order) idle.push(u);
    }
    if (idle.length) {
      let best = null, bd = 1e9;
      for (const e of g.list) {
        if (e.dead || e.owner !== enemy || e.kind !== 'building') continue;
        const d = Math.hypot(e.x - idle[0].x, e.y - idle[0].y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        for (const u of idle) {
          if (bd < 8) g.cmdAttack(me, [u.id], best.id);
          else g.cmdMove(me, [u.id], best.x + (best.w >> 1), best.y + best.h, true);
        }
      }
    }
    // Los que no atacan esperan frente a la base
    const rx = Math.round(hall.x + (MAPW / 2 - hall.x) * 0.22), ry = Math.round(hall.y + (MAPH / 2 - hall.y) * 0.22);
    const loose = ready.filter(u => !u.order && Math.hypot(u.x - rx, u.y - ry) > 6);
    if (loose.length) g.cmdMove(me, loose.map(u => u.id), rx, ry, true);
  }
}
