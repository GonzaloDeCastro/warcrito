// Simulación: no toca el DOM, así se puede probar con Node.
// Cada unidad ocupa una casilla (como en los clásicos) y se interpola al caminar.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class Game {
  constructor(opt) {
    this.opt = opt;
    this.rng = makeRng(opt.seed || 1);
    const map = generateMap(opt.map || 'valle', opt.seed || 1);
    this.terrain = map.terrain;
    this.bases = map.bases;
    this.wood = new Uint16Array(MAPW * MAPH);
    for (let i = 0; i < this.wood.length; i++) if (this.terrain[i] === T_TREE) this.wood[i] = TREE_WOOD;
    this.occ = new Uint8Array(MAPW * MAPH);   // cantidad de unidades en la casilla
    this.bld = new Int32Array(MAPW * MAPH);   // id del edificio que la tapa
    this.ents = new Map();
    this.list = [];
    this.nextId = 1;
    this.time = 0;
    this.projectiles = [];
    this.events = [];
    this.winner = null;
    this.treeVersion = 0;
    this.players = opt.factions.map((f, i) => ({
      id: i, faction: f, gold: 600, wood: 350, food: 0, cap: 0,
      upg: { weapon: 0, armor: 0, arrow: 0 }, researching: {},
      visible: new Uint8Array(MAPW * MAPH), explored: new Uint8Array(MAPW * MAPH),
      stats: { trained: 0, lost: 0, razed: 0, gold: 0, wood: 0 },
    }));
    this.fogT = 0;
    // A*
    this._g = new Float32Array(MAPW * MAPH);
    this._from = new Int32Array(MAPW * MAPH);
    this._mark = new Int32Array(MAPW * MAPH);
    this._closed = new Int32Array(MAPW * MAPH);
    this._stamp = 0;

    for (const m of map.mines) {
      const b = this.addBuilding('mine', -1, m.x, m.y, true);
      b.gold = m.gold;
    }
    this.players.forEach((p, i) => {
      const b = this.bases[i];
      this.addBuilding('hall', i, b.x, b.y, true);
      for (let k = 0; k < 4; k++) this.addUnit('worker', i, b.x + k, b.y + 4);
    });
    this.recount();
    this.updateFog();
  }

  // ───────── utilidades ─────────
  inb(x, y) { return x >= 0 && y >= 0 && x < MAPW && y < MAPH; }
  walkable(x, y) {
    if (!this.inb(x, y)) return false;
    const i = y * MAPW + x, v = this.terrain[i];
    return v !== T_TREE && v !== T_WATER && v !== T_ROCK && !this.bld[i];
  }
  free(x, y) { return this.walkable(x, y) && !this.occ[y * MAPW + x]; }
  get(id) { return this.ents.get(id); }
  stat(u) { return UNIT_CACHE[this.players[u.owner].faction][u.type]; }
  name(e) {
    const f = e.owner >= 0 ? this.players[e.owner].faction : 'human';
    return (e.kind === 'unit' ? UNITS : BUILDINGS)[e.type].names[f];
  }
  maxHp(e) { return e.kind === 'unit' ? this.stat(e).hp : BUILDINGS[e.type].hp; }
  dmgOf(u) {
    const s = this.stat(u), up = this.players[u.owner].upg;
    let d = s.dmg;
    if (u.type === 'melee' || u.type === 'cavalry') d += up.weapon * 2;
    if (u.type === 'ranged') d += up.arrow * 2;
    if (u.buffT > 0) d *= 1.5;
    return d;
  }
  armorOf(e) {
    if (e.kind === 'building') return 4;
    let a = this.stat(e).arm;
    if (e.type !== 'worker' && e.type !== 'siege') a += this.players[e.owner].upg.armor * 2;
    return a;
  }
  emit(type, data) { this.events.push(Object.assign({ type }, data)); }
  msg(owner, text, x, y) { this.emit('msg', { owner, text, x, y }); }

  // Distancia en casillas desde (x,y) a una entidad
  gap(x, y, e) {
    const w = e.kind === 'building' ? e.w : 1, h = e.kind === 'building' ? e.h : 1;
    const dx = Math.max(e.x - x, 0, x - (e.x + w - 1));
    const dy = Math.max(e.y - y, 0, y - (e.y + h - 1));
    return { dx, dy, cheb: Math.max(dx, dy), euc: Math.hypot(dx, dy) };
  }
  inRange(u, t) {
    const s = this.stat(u), g = this.gap(u.x, u.y, t);
    if (s.range <= 1) return g.cheb <= 1;
    if (s.minRange && g.euc < s.minRange) return false;
    return g.euc <= s.range + 0.4;
  }
  center(e) {
    return e.kind === 'building' ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : { x: e.px + 0.5, y: e.py + 0.5 };
  }

  // ───────── entidades ─────────
  addUnit(type, owner, x, y) {
    const spot = this.free(x, y) ? { x, y } : this.nearestFree(x, y);
    if (!spot) return null;
    const s = UNIT_CACHE[this.players[owner].faction][type];
    const u = {
      id: this.nextId++, kind: 'unit', type, owner, x: spot.x, y: spot.y, px: spot.x, py: spot.y,
      hp: s.hp, mana: s.mana ? 60 : 0, order: null, path: [], moving: false, fx: 0, fy: 0, mt: 0,
      cd: 0, dirx: 0, diry: 1, attackT: 0, walkT: 0, carry: null, hidden: false, buffT: 0,
      wait: 0, fails: 0, think: this.rng() * 0.3, hitT: 0, ghost: false,
    };
    this.occ[spot.y * MAPW + spot.x]++;
    this.ents.set(u.id, u);
    this.list.push(u);
    return u;
  }
  addBuilding(type, owner, x, y, done) {
    const d = BUILDINGS[type];
    const b = {
      id: this.nextId++, kind: 'building', type, owner, x, y, w: d.w, h: d.h,
      hp: done ? d.hp : d.hp * 0.1, done: !!done, progress: done ? 1 : 0, queue: [], rally: null,
      builderId: 0, cd: 0, gold: 0, hitT: 0, busy: 0,
    };
    for (let j = 0; j < d.h; j++)
      for (let i = 0; i < d.w; i++) this.bld[(y + j) * MAPW + x + i] = b.id;
    this.ents.set(b.id, b);
    this.list.push(b);
    return b;
  }
  remove(e) {
    if (!this.ents.has(e.id)) return;
    if (e.kind === 'unit') {
      if (!e.hidden) this.occ[e.y * MAPW + e.x]--;
    } else {
      for (let j = 0; j < e.h; j++)
        for (let i = 0; i < e.w; i++) this.bld[(e.y + j) * MAPW + e.x + i] = 0;
    }
    this.ents.delete(e.id);
    e.dead = true;
  }
  hideUnit(u) {
    if (u.hidden) return;
    this.occ[u.y * MAPW + u.x]--;
    u.hidden = true; u.moving = false; u.path = [];
  }
  showUnit(u, near) {
    if (!u.hidden) return;
    const spot = near ? this.spotAround(near, u.towards || near) : this.nearestFree(u.x, u.y);
    const p = spot || { x: u.x, y: u.y };
    u.x = p.x; u.y = p.y; u.px = p.x; u.py = p.y;
    u.hidden = false;
    this.occ[p.y * MAPW + p.x]++;
  }
  nearestFree(x, y, maxR = 12) {
    if (this.free(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.free(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    return null;
  }
  // Casilla libre en el borde de un edificio, la más cercana a "towards"
  spotAround(b, towards) {
    for (let r = 1; r <= 4; r++) {
      let best = null, bd = 1e9;
      for (let y = b.y - r; y < b.y + b.h + r; y++)
        for (let x = b.x - r; x < b.x + b.w + r; x++) {
          if (!this.free(x, y)) continue;
          const d = towards ? Math.hypot(x - towards.x, y - towards.y) : -y * 10 + Math.abs(x - b.x);
          if (d < bd) { bd = d; best = { x, y }; }
        }
      if (best) return best;
    }
    return null;
  }

  // ───────── pathfinding ─────────
  // Camina hasta quedar a "range" casillas del rectángulo goal {x,y,w,h}.
  // Si no se puede llegar, devuelve el camino al punto más cercano.
  findPath(u, goal, range, avoidUnits) {
    const stamp = ++this._stamp;
    const gS = this._g, from = this._from, mark = this._mark, closed = this._closed;
    const x1 = goal.x + (goal.w || 1) - 1, y1 = goal.y + (goal.h || 1) - 1;
    const heur = (x, y) => {
      const dx = Math.max(goal.x - x, 0, x - x1), dy = Math.max(goal.y - y, 0, y - y1);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const done = (x, y) => {
      const dx = Math.max(goal.x - x, 0, x - x1), dy = Math.max(goal.y - y, 0, y - y1);
      if (range <= 1) return Math.max(dx, dy) <= range;
      return Math.hypot(dx, dy) <= range;
    };
    const heap = [], keys = [];
    const push = (n, k) => {
      let i = heap.length;
      heap.push(n); keys.push(k);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= k) break;
        heap[i] = heap[p]; keys[i] = keys[p]; i = p;
      }
      heap[i] = n; keys[i] = k;
    };
    const pop = () => {
      const top = heap[0], n = heap.pop(), k = keys.pop();
      const len = heap.length;
      if (len) {
        let i = 0;
        while (true) {
          let c = i * 2 + 1;
          if (c >= len) break;
          if (c + 1 < len && keys[c + 1] < keys[c]) c++;
          if (keys[c] >= k) break;
          heap[i] = heap[c]; keys[i] = keys[c]; i = c;
        }
        heap[i] = n; keys[i] = k;
      }
      return top;
    };
    const s = u.y * MAPW + u.x;
    mark[s] = stamp; gS[s] = 0; from[s] = -1;
    push(s, heur(u.x, u.y));
    let best = s, bestH = heur(u.x, u.y), found = -1;
    while (heap.length) {
      const i = pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      const x = i % MAPW, y = (i / MAPW) | 0;
      if (done(x, y)) { found = i; break; }
      const h = heur(x, y);
      if (h < bestH) { bestH = h; best = i; }
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1], nx = x + dx, ny = y + dy;
        if (!this.walkable(nx, ny)) continue;
        if (d > 3 && (!this.walkable(x + dx, y) || !this.walkable(x, y + dy))) continue;
        const j = ny * MAPW + nx;
        if (closed[j] === stamp) continue;
        let c = d > 3 ? 1.414 : 1;
        if (this.occ[j] && !u.ghost) c += avoidUnits ? 12 : 1.5;
        const ng = gS[i] + c;
        if (mark[j] !== stamp || ng < gS[j]) {
          mark[j] = stamp; gS[j] = ng; from[j] = i;
          push(j, ng + heur(nx, ny));
        }
      }
    }
    let n = found >= 0 ? found : best;
    const path = [];
    while (n !== s && n >= 0) { path.push({ x: n % MAPW, y: (n / MAPW) | 0 }); n = from[n]; }
    path.reverse();
    return { path, complete: found >= 0 };
  }

  startStep(u, nx, ny) {
    this.occ[u.y * MAPW + u.x]--;
    this.occ[ny * MAPW + nx]++;
    u.fx = u.x; u.fy = u.y;
    u.dirx = nx - u.x; u.diry = ny - u.y;
    u.x = nx; u.y = ny;
    u.moving = true;
  }
  advance(u, dt) {
    if (!u.moving) return;
    const len = (u.x !== u.fx && u.y !== u.fy) ? 1.414 : 1;
    u.mt += this.stat(u).speed * dt / len;
    u.walkT += dt;
    if (u.mt >= 1) {
      u.mt -= 1; u.moving = false; u.px = u.x; u.py = u.y;
    } else {
      u.px = u.fx + (u.x - u.fx) * u.mt;
      u.py = u.fy + (u.y - u.fy) * u.mt;
    }
  }

  // Da un paso hacia el objetivo. 'there' si ya llegó, 'fail' si no hay forma.
  travel(u, goal, range, dt) {
    if (u.moving) return 'moving';
    const x1 = goal.x + (goal.w || 1) - 1, y1 = goal.y + (goal.h || 1) - 1;
    const dx = Math.max(goal.x - u.x, 0, u.x - x1), dy = Math.max(goal.y - u.y, 0, u.y - y1);
    const there = range <= 1 ? Math.max(dx, dy) <= range : Math.hypot(dx, dy) <= range;
    if (there) { u.path = []; u.fails = 0; return 'there'; }
    if (u.wait > 0) { u.wait -= dt; return 'moving'; }
    const key = goal.x + ',' + goal.y + ',' + range;
    if (u.pathKey !== key || !u.path.length) {
      const r = this.findPath(u, goal, range, u.fails > 0);
      u.path = r.path; u.pathKey = key;
      if (!r.path.length) {
        u.fails++;
        u.wait = 0.4 + this.rng() * 0.4;
        return u.fails > 5 ? 'fail' : 'moving';
      }
    }
    const n = u.path[0];
    const diagBlocked = n.x !== u.x && n.y !== u.y && (!this.walkable(n.x, u.y) || !this.walkable(u.x, n.y));
    if (!this.walkable(n.x, n.y) || diagBlocked) { u.path = []; return 'moving'; }
    if (this.occ[n.y * MAPW + n.x] && !u.ghost) {
      u.fails++;
      u.wait = 0.12 + this.rng() * 0.25;
      if (u.fails > 1) u.path = [];
      u.mt = 0;
      return u.fails > 8 ? 'fail' : 'moving';
    }
    u.path.shift();
    u.fails = 0;
    this.startStep(u, n.x, n.y);
    this.advance(u, 0);
    return 'moving';
  }

  // ───────── órdenes ─────────
  setOrder(u, order) {
    if (u.hidden) return;
    if (u.order && u.order.type === 'build' && u.order.started) return;
    u.order = order;
    u.path = []; u.pathKey = null; u.wait = 0; u.fails = 0;
    u.ghost = !!order && (order.type === 'harvest' || order.type === 'return');
  }
  unitsOf(ids, owner) {
    return ids.map(id => this.get(id)).filter(e => e && e.kind === 'unit' && e.owner === owner);
  }
  cmdMove(owner, ids, x, y, attack) {
    const us = this.unitsOf(ids, owner);
    if (!us.length) return;
    // Un destino distinto para cada unidad, en espiral alrededor del punto
    const spots = [], seen = new Set();
    for (let r = 0; r < 12 && spots.length < us.length; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (spots.length < us.length && this.walkable(x + dx, y + dy) && !seen.has((y + dy) * MAPW + x + dx)) {
            seen.add((y + dy) * MAPW + x + dx);
            spots.push({ x: x + dx, y: y + dy });
          }
        }
    if (!spots.length) spots.push({ x, y });
    // Las más cercanas al destino toman los lugares centrales
    us.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    us.forEach((u, i) => {
      const p = spots[Math.min(i, spots.length - 1)];
      const atk = attack && u.type !== 'worker';
      this.setOrder(u, { type: atk ? 'amove' : 'move', x: p.x, y: p.y });
    });
  }
  cmdAttack(owner, ids, targetId) {
    const t = this.get(targetId);
    if (!t || t.type === 'mine') return;
    for (const u of this.unitsOf(ids, owner))
      if (u.id !== targetId) this.setOrder(u, { type: 'attack', target: targetId, forced: true });
  }
  cmdStop(owner, ids) { for (const u of this.unitsOf(ids, owner)) this.setOrder(u, null); }
  cmdHold(owner, ids) { for (const u of this.unitsOf(ids, owner)) this.setOrder(u, { type: 'hold' }); }
  cmdMine(owner, ids, mineId) {
    for (const u of this.unitsOf(ids, owner))
      if (u.type === 'worker') this.setOrder(u, { type: 'harvest', res: 'gold', mine: mineId });
  }
  cmdChop(owner, ids, x, y) {
    for (const u of this.unitsOf(ids, owner))
      if (u.type === 'worker') this.setOrder(u, { type: 'harvest', res: 'wood', x, y });
  }
  cmdReturn(owner, ids) {
    for (const u of this.unitsOf(ids, owner))
      if (u.carry) this.setOrder(u, { type: 'return', next: null });
  }
  cmdRepair(owner, ids, bid) {
    for (const u of this.unitsOf(ids, owner))
      if (u.type === 'worker') this.setOrder(u, { type: 'repair', target: bid });
  }

  hasBuilding(owner, type) {
    return this.list.some(e => !e.dead && e.kind === 'building' && e.owner === owner && e.type === type && e.done);
  }
  missing(owner, needs) {
    return (needs || []).filter(n => !this.hasBuilding(owner, n))
      .map(n => BUILDINGS[n].names[this.players[owner].faction]);
  }
  canPay(owner, gold, wood) {
    const p = this.players[owner];
    return p.gold >= gold && p.wood >= wood;
  }
  pay(owner, gold, wood, sign = -1) {
    this.players[owner].gold += sign * gold;
    this.players[owner].wood += sign * wood;
  }

  canPlace(type, x, y, owner, builderId) {
    const d = BUILDINGS[type];
    for (let j = 0; j < d.h; j++)
      for (let i = 0; i < d.w; i++) {
        const cx = x + i, cy = y + j;
        if (!this.walkable(cx, cy) || this.terrain[cy * MAPW + cx] === T_BRIDGE) return false;
        if (!this.players[owner].explored[cy * MAPW + cx]) return false;
      }
    for (const e of this.list) {
      if (e.dead) continue;
      if (e.kind === 'unit' && !e.hidden && e.id !== builderId && e.x >= x && e.y >= y && e.x < x + d.w && e.y < y + d.h) return false;
      if (type === 'hall' && e.type === 'mine') {
        // el ayuntamiento no puede quedar pegado a la mina
        if (x < e.x + e.w + 2 && x + d.w > e.x - 2 && y < e.y + e.h + 2 && y + d.h > e.y - 2) return false;
      }
    }
    return true;
  }
  cmdBuild(owner, unitId, type, x, y) {
    const u = this.get(unitId), d = BUILDINGS[type];
    if (!u || u.owner !== owner || u.type !== 'worker' || u.hidden) return false;
    const miss = this.missing(owner, d.needs);
    if (miss.length) { this.msg(owner, 'Necesitás: ' + miss.join(', ')); return false; }
    if (!this.canPay(owner, d.gold, d.wood)) { this.msg(owner, 'No alcanzan los recursos.'); return false; }
    if (!this.canPlace(type, x, y, owner, u.id)) { this.msg(owner, 'No se puede construir ahí.'); return false; }
    this.setOrder(u, { type: 'build', btype: type, x, y, started: false });
    return true;
  }

  queueFood(owner) {
    let n = 0;
    for (const e of this.list)
      if (!e.dead && e.kind === 'building' && e.owner === owner && e.queue.length && e.queue[0].kind === 'unit' && e.queue[0].started)
        n += UNITS[e.queue[0].type].food;
    return n;
  }
  cmdTrain(owner, bid, type) {
    const b = this.get(bid), d = UNITS[type];
    if (!b || b.owner !== owner || !b.done || d.from !== b.type) return false;
    const miss = this.missing(owner, d.needs);
    if (miss.length) { this.msg(owner, 'Necesitás: ' + miss.join(', ')); return false; }
    if (b.queue.length >= 5) { this.msg(owner, 'La cola está llena.'); return false; }
    if (!this.canPay(owner, d.gold, d.wood)) { this.msg(owner, 'No alcanzan los recursos.'); return false; }
    this.pay(owner, d.gold, d.wood);
    b.queue.push({ kind: 'unit', type, t: 0, total: d.time, gold: d.gold, wood: d.wood, started: false });
    return true;
  }
  cmdResearch(owner, bid, key) {
    const b = this.get(bid), d = UPGRADES[key], p = this.players[owner];
    if (!b || b.owner !== owner || !b.done || d.at !== b.type) return false;
    const lvl = p.upg[key];
    if (lvl >= d.max || p.researching[key]) return false;
    if (b.queue.length >= 5) return false;
    if (!this.canPay(owner, d.gold[lvl], d.wood[lvl])) { this.msg(owner, 'No alcanzan los recursos.'); return false; }
    this.pay(owner, d.gold[lvl], d.wood[lvl]);
    p.researching[key] = true;
    b.queue.push({ kind: 'upg', type: key, t: 0, total: d.time[lvl], gold: d.gold[lvl], wood: d.wood[lvl], started: false });
    return true;
  }
  cmdCancel(owner, bid) {
    const b = this.get(bid);
    if (!b || b.owner !== owner) return;
    if (!b.done) {
      const d = BUILDINGS[b.type];
      this.pay(owner, Math.floor(d.gold * 0.75), Math.floor(d.wood * 0.75), 1);
      const w = this.get(b.builderId);
      this.remove(b);
      if (w) { w.order = null; this.showUnit(w); }
    } else if (b.queue.length) {
      const q = b.queue.pop();
      this.pay(owner, q.gold, q.wood, 1);
      if (q.kind === 'upg') this.players[owner].researching[q.type] = false;
    }
    this.recount();
  }
  cmdRally(owner, bid, x, y) {
    const b = this.get(bid);
    if (b && b.owner === owner) b.rally = { x, y };
  }
  // Clic derecho: decide qué hacer según lo que haya debajo
  cmdSmart(owner, ids, x, y, target) {
    const us = this.unitsOf(ids, owner);
    if (!us.length) {
      for (const id of ids) {
        const b = this.get(id);
        if (b && b.kind === 'building' && b.owner === owner) this.cmdRally(owner, id, x, y);
      }
      return 'rally';
    }
    const workers = us.filter(u => u.type === 'worker');
    const others = us.filter(u => u.type !== 'worker').map(u => u.id);
    if (target) {
      if (target.type === 'mine') {
        this.cmdMine(owner, workers.map(u => u.id), target.id);
        this.cmdMove(owner, others, x, y);
        return 'harvest';
      }
      if (target.owner !== owner) { this.cmdAttack(owner, ids, target.id); return 'attack'; }
      if (target.kind === 'building') {
        for (const w of workers) {
          if (!target.done) this.cmdRepair(owner, [w.id], target.id);
          else if (w.carry && this.accepts(target, w.carry.type)) this.cmdReturn(owner, [w.id]);
          else if (target.hp < this.maxHp(target)) this.cmdRepair(owner, [w.id], target.id);
          else this.cmdMove(owner, [w.id], x, y);
        }
        this.cmdMove(owner, others, x, y);
        return 'move';
      }
    }
    if (workers.length && this.terrain[y * MAPW + x] === T_TREE && this.players[owner].explored[y * MAPW + x]) {
      this.cmdChop(owner, workers.map(u => u.id), x, y);
      this.cmdMove(owner, others, x, y);
      return 'harvest';
    }
    this.cmdMove(owner, ids, x, y);
    return 'move';
  }

  // ───────── economía ─────────
  accepts(b, res) { return b.done && (b.type === 'hall' || (res === 'wood' && b.type === 'mill')); }
  nearestDrop(u, res) {
    let best = null, bd = 1e9;
    for (const e of this.list) {
      if (e.dead || e.kind !== 'building' || e.owner !== u.owner || !this.accepts(e, res)) continue;
      const d = this.gap(u.x, u.y, e).euc;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestMine(x, y, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const e of this.list) {
      if (e.dead || e.type !== 'mine' || e.gold <= 0) continue;
      const d = Math.hypot(e.x + 1 - x, e.y + 1 - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // Árbol alcanzable más cercano a (x,y), buscando por casillas caminables
  nearestTree(x, y, maxN = 900) {
    if (!this.inb(x, y)) return null;
    if (this.terrain[y * MAPW + x] === T_TREE && DIRS.some(d => this.walkable(x + d[0], y + d[1]))) return { x, y };
    const seen = new Set([y * MAPW + x]);
    const q = [[x, y]];
    for (let h = 0; h < q.length && h < maxN; h++) {
      const [cx, cy] = q[h];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (!this.inb(nx, ny)) continue;
        const i = ny * MAPW + nx;
        if (this.terrain[i] === T_TREE && this.walkable(cx, cy)) return { x: nx, y: ny };
        if (!seen.has(i) && this.walkable(nx, ny)) { seen.add(i); q.push([nx, ny]); }
      }
    }
    return null;
  }

  doHarvest(u, o, dt) {
    if (u.carry && u.carry.type === o.res) {
      this.setOrder(u, { type: 'return', next: o });
      return;
    }
    if (o.res === 'gold') {
      let m = this.get(o.mine);
      if (!m || m.gold <= 0) {
        m = this.nearestMine(u.x, u.y, 22);
        if (!m) { u.order = null; u.ghost = false; return; }
        o.mine = m.id;
      }
      const r = this.travel(u, m, 1, dt);
      if (r === 'there') {
        u.towards = this.nearestDrop(u, 'gold');
        o.timer = MINE_TIME;
        o.inside = true;
        m.busy++;
        this.hideUnit(u);
      } else if (r === 'fail') u.order = null;
      return;
    }
    // madera
    const i = o.y * MAPW + o.x;
    if (this.terrain[i] !== T_TREE) {
      const t = this.nearestTree(o.x, o.y) || this.nearestTree(u.x, u.y);
      if (!t) { u.order = null; u.ghost = false; return; }
      o.x = t.x; o.y = t.y; o.timer = 0;
      return;
    }
    const r = this.travel(u, o, 1, dt);
    if (r === 'there') {
      u.dirx = Math.sign(o.x - u.x); u.diry = Math.sign(o.y - u.y);
      const prev = o.timer || 0;
      o.timer = prev + dt;
      u.attackT = 0.5 - (o.timer % 0.9) * 0.55;
      if (Math.floor(prev / 0.9) !== Math.floor(o.timer / 0.9)) this.emit('chop', { x: o.x + 0.5, y: o.y + 0.5, owner: u.owner });
      if (o.timer >= CHOP_TIME) {
        o.timer = 0;
        const amt = Math.min(WOOD_LOAD, this.wood[i]);
        this.wood[i] -= amt;
        u.carry = { type: 'wood', amt };
        if (this.wood[i] <= 0) { this.terrain[i] = T_STUMP; this.treeVersion++; }
        this.setOrder(u, { type: 'return', next: o });
      }
    } else if (r === 'fail' || (r === 'moving' && u.fails > 2)) {
      const t = this.nearestTree(u.x, u.y);
      if (t) { o.x = t.x; o.y = t.y; u.fails = 0; u.path = []; } else u.order = null;
    }
  }
  // Obrero dentro de la mina
  insideMine(u, dt) {
    const o = u.order, m = this.get(o.mine);
    o.timer -= dt;
    if (o.timer > 0 && m) return;
    o.inside = false;
    if (m) {
      m.busy = Math.max(0, m.busy - 1);
      const amt = Math.min(GOLD_LOAD, m.gold);
      m.gold -= amt;
      u.x = m.x + 1; u.y = m.y + 1;
      this.showUnit(u, m);
      if (amt > 0) u.carry = { type: 'gold', amt };
      if (m.gold <= 0) {
        this.msg(u.owner, 'Una mina de oro se agotó.', m.x, m.y);
        this.remove(m);
      }
    } else this.showUnit(u);
    this.setOrder(u, { type: 'return', next: { type: 'harvest', res: 'gold', mine: o.mine } });
  }
  doReturn(u, o, dt) {
    if (!u.carry) { this.setOrder(u, o.next); return; }
    let t = this.get(o.drop);
    if (!t || !this.accepts(t, u.carry.type)) {
      t = this.nearestDrop(u, u.carry.type);
      if (!t) { u.order = null; u.ghost = false; return; }
      o.drop = t.id;
    }
    const r = this.travel(u, t, 1, dt);
    if (r === 'there') {
      const p = this.players[u.owner];
      let amt = u.carry.amt;
      if (u.carry.type === 'wood' && this.hasBuilding(u.owner, 'mill')) amt = Math.round(amt * 1.2);
      if (p.bonus) amt = Math.round(amt * p.bonus);
      p[u.carry.type] += amt;
      p.stats[u.carry.type] += amt;
      u.carry = null;
      this.setOrder(u, o.next);
    } else if (r === 'fail') u.order = null;
  }
  doBuild(u, o, dt) {
    const d = BUILDINGS[o.btype];
    if (!o.started) {
      const rect = { x: o.x, y: o.y, w: d.w, h: d.h };
      const r = this.travel(u, rect, 1, dt);
      if (r === 'fail') { u.order = null; this.msg(u.owner, 'El obrero no puede llegar.'); return; }
      if (r !== 'there') return;
      if (!this.canPay(u.owner, d.gold, d.wood)) { u.order = null; this.msg(u.owner, 'No alcanzan los recursos.'); return; }
      if (!this.canPlace(o.btype, o.x, o.y, u.owner, u.id)) { u.order = null; this.msg(u.owner, 'El lugar quedó tapado.'); return; }
      this.pay(u.owner, d.gold, d.wood);
      this.hideUnit(u);
      const b = this.addBuilding(o.btype, u.owner, o.x, o.y, false);
      b.builderId = u.id;
      o.started = true; o.bid = b.id;
      this.emit('place', { x: o.x + d.w / 2, y: o.y + d.h / 2, owner: u.owner });
    }
  }
  doRepair(u, o, dt) {
    const b = this.get(o.target);
    if (!b || b.hp >= this.maxHp(b)) { u.order = null; return; }
    if (!b.done) { u.order = null; return; }
    const r = this.travel(u, b, 1, dt);
    if (r === 'fail') { u.order = null; return; }
    if (r !== 'there') return;
    const p = this.players[u.owner];
    if (p.gold <= 0 || p.wood <= 0) { u.order = null; this.msg(u.owner, 'Sin recursos para reparar.'); return; }
    u.dirx = Math.sign(b.x + b.w / 2 - u.x - 0.5); u.diry = Math.sign(b.y + b.h / 2 - u.y - 0.5);
    u.attackT = 0.5 - (this.time % 0.8) * 0.6;
    o.acc = (o.acc || 0) + dt;
    if (o.acc >= 0.8) {
      o.acc = 0;
      b.hp = Math.min(this.maxHp(b), b.hp + 20);
      p.gold -= 2; p.wood -= 2;
      this.emit('chop', { x: u.x + 0.5, y: u.y + 0.5, owner: u.owner });
    }
  }

  // ───────── combate ─────────
  findEnemy(x, y, owner, radius) {
    let best = null, bd = 1e9;
    for (const e of this.list) {
      if (e.dead || e.owner < 0 || e.owner === owner || e.hidden) continue;
      const g = this.gap(x, y, e);
      if (g.euc > radius) continue;
      // primero lo que pelea, después obreros y por último edificios
      let score = g.euc;
      if (e.kind === 'building') score += e.type === 'tower' ? 2 : 8;
      else if (e.type === 'worker') score += 3;
      if (score < bd) { bd = score; best = e; }
    }
    return best;
  }
  strike(u, t, dt) {
    const s = this.stat(u);
    const c = this.center(t);
    u.dirx = Math.sign(Math.round(c.x - u.x - 0.5)); u.diry = Math.sign(Math.round(c.y - u.y - 0.5));
    if (u.cd > 0) return;
    u.cd = s.cd;
    u.attackT = 0.4;
    const dmg = this.dmgOf(u) * (0.8 + this.rng() * 0.4);
    if (s.range > 1) {
      const kind = u.type === 'siege' ? 'rock' : u.type === 'caster' ? 'orb' : this.players[u.owner].faction === 'orc' ? 'axe' : 'arrow';
      this.shoot(u, t, kind, dmg, s.splash);
    } else {
      this.damage(t, dmg, u);
      this.emit('hit', { x: c.x, y: c.y, big: u.type === 'cavalry' });
    }
  }
  shoot(src, t, kind, dmg, splash) {
    const a = this.center(src), b = this.center(t);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    this.projectiles.push({
      kind, x0: a.x, y0: a.y - (src.kind === 'building' ? 1.2 : 0.2), tx: b.x, ty: b.y, target: t.id, owner: src.owner, source: src.id,
      t: 0, dur: Math.max(0.12, dist / (kind === 'rock' ? 7 : 12)), dmg, splash: splash || 0,
    });
    this.emit('shoot', { x: a.x, y: a.y, kind });
  }
  impact(p) {
    const src = this.get(p.source) || { owner: p.owner, id: 0 };
    if (p.splash) {
      this.emit('boom', { x: p.tx, y: p.ty });
      for (const e of this.list.slice()) {
        if (e.dead || e.hidden || e.owner < 0 || e.owner === p.owner) continue;
        const d = this.gap(Math.floor(p.tx), Math.floor(p.ty), e).euc;
        if (d <= p.splash) this.damage(e, d < 0.5 ? p.dmg : p.dmg * 0.5, src);
      }
    } else {
      const t = this.get(p.target);
      if (t && !t.hidden) this.damage(t, p.dmg, src);
    }
  }
  damage(t, raw, src) {
    if (t.dead || t.type === 'mine') return;
    const dmg = Math.max(1, Math.round(raw - this.armorOf(t)));
    t.hp -= dmg;
    t.hitT = 0.15;
    if (this.time - (this.players[t.owner].lastAlert || -99) > 12 && src.owner !== t.owner) {
      this.players[t.owner].lastAlert = this.time;
      const c = this.center(t);
      this.emit('alert', { owner: t.owner, x: c.x, y: c.y, building: t.kind === 'building' });
    }
    this.players[t.owner].attackedAt = this.time;
    this.players[t.owner].attackedPos = this.center(t);
    if (t.hp <= 0) { this.kill(t, src); return; }
    // Responder al ataque
    if (t.kind === 'unit' && src.id) {
      const a = this.get(src.id);
      if (!a) return;
      const o = t.order;
      if (t.type !== 'worker' && t.type !== 'caster') {
        if (!o || o.type === 'amove' && !o.engaged) {
          if (!o) this.setOrder(t, { type: 'attack', target: a.id, home: { x: t.x, y: t.y } });
          else o.engaged = a.id;
        } else if (o.type === 'attack' && !o.forced) {
          const cur = this.get(o.target);
          if (cur && cur.kind === 'building' && a.kind === 'unit') o.target = a.id;
        }
      }
    }
  }
  kill(t, src) {
    const c = this.center(t);
    const by = src && src.owner >= 0 ? this.players[src.owner] : null;
    if (t.kind === 'unit') {
      this.players[t.owner].stats.lost++;
      this.emit('death', { x: c.x, y: c.y, utype: t.type, faction: this.players[t.owner].faction });
    } else {
      if (by) by.stats.razed++;
      this.emit('collapse', { x: c.x, y: c.y, w: t.w, h: t.h });
      for (const q of t.queue) if (q.kind === 'upg') this.players[t.owner].researching[q.type] = false;
      const w = this.get(t.builderId);
      this.remove(t);
      if (w && !t.done) { w.order = null; this.showUnit(w); }
      this.msg(t.owner, 'Perdiste: ' + this.name(t), c.x, c.y);
      this.recount();
      this.checkWin();
      return;
    }
    this.remove(t);
    this.recount();
  }
  checkWin() {
    if (this.winner !== null) return;
    for (const p of this.players) {
      const alive = this.list.some(e => !e.dead && e.kind === 'building' && e.owner === p.id);
      if (!alive) { this.winner = 1 - p.id; this.emit('end', { winner: this.winner }); return; }
    }
  }

  castSpell(u) {
    const faction = this.players[u.owner].faction;
    if (u.mana < (faction === 'human' ? 6 : 40)) return false;
    let best = null, bv = 0;
    for (const e of this.list) {
      if (e.dead || e.hidden || e.kind !== 'unit' || e.owner !== u.owner) continue;
      if (Math.hypot(e.x - u.x, e.y - u.y) > 6) continue;
      if (faction === 'human') {
        const missing = this.maxHp(e) - e.hp;
        if (e.type !== 'siege' && missing >= 8 && missing > bv) { bv = missing; best = e; }
      } else {
        const fighting = e.order && (e.order.type === 'attack' || e.order.engaged) && e.type !== 'caster' && e.type !== 'worker';
        if (fighting && !(e.buffT > 0) && this.maxHp(e) > bv) { bv = this.maxHp(e); best = e; }
      }
    }
    if (!best) return false;
    if (faction === 'human') {
      const amt = Math.min(bv, 24, Math.floor(u.mana / 1.5) * 2);
      best.hp = Math.min(this.maxHp(best), best.hp + amt);
      u.mana -= amt * 0.75;
      this.emit('heal', { x: best.px + 0.5, y: best.py + 0.5 });
      u.cd = 1.4;
    } else {
      best.buffT = 16;
      u.mana -= 40;
      this.emit('fury', { x: best.px + 0.5, y: best.py + 0.5 });
      u.cd = 1.6;
    }
    u.attackT = 0.4;
    return true;
  }

  updateUnit(u, dt) {
    if (u.cd > 0) u.cd -= dt;
    if (u.attackT > 0) u.attackT -= dt;
    if (u.hitT > 0) u.hitT -= dt;
    if (u.buffT > 0) u.buffT -= dt;
    const s = this.stat(u);
    if (s.mana) u.mana = Math.min(s.mana, u.mana + dt * 1.6);
    if (u.hidden) {
      if (u.order && u.order.type === 'harvest' && u.order.inside) this.insideMine(u, dt);
      return;
    }
    this.advance(u, dt);
    u.think -= dt;
    let o = u.order;

    if (u.type === 'caster' && !u.moving && u.cd <= 0 && u.think <= 0 && (!o || o.type !== 'move')) {
      if (this.castSpell(u)) return;
    }

    if (!o || o.type === 'hold') {
      // Una unidad quieta sobre otra se corre a un lado
      if (!u.moving && this.occ[u.y * MAPW + u.x] > 1) {
        const p = this.nearestFree(u.x, u.y, 3);
        if (p && Math.max(Math.abs(p.x - u.x), Math.abs(p.y - u.y)) === 1) this.startStep(u, p.x, p.y);
      }
      if (u.type === 'worker' || u.moving) return;
      if (u.think <= 0) {
        u.think = 0.35;
        const radius = o ? s.range + 0.4 : s.sight;
        const e = this.findEnemy(u.x, u.y, u.owner, radius);
        if (e) {
          if (o) o.engaged = e.id;
          else if (u.type !== 'caster') this.setOrder(u, { type: 'attack', target: e.id, home: { x: u.x, y: u.y } });
          else if (this.inRange(u, e)) this.strike(u, e, dt);
        }
      }
      if (o && o.engaged) {
        const e = this.get(o.engaged);
        if (e && !e.hidden && this.inRange(u, e)) this.strike(u, e, dt);
        else o.engaged = 0;
      }
      return;
    }

    switch (o.type) {
      case 'move': {
        const r = this.travel(u, o, 0, dt);
        if (r === 'there' || r === 'fail') u.order = null;
        else if (r === 'moving' && u.fails >= 3 && Math.max(Math.abs(u.x - o.x), Math.abs(u.y - o.y)) <= 2) u.order = null;
        break;
      }
      case 'amove': {
        if (u.think <= 0) {
          u.think = 0.3;
          const e = this.findEnemy(u.x, u.y, u.owner, s.sight + 0.5);
          if (e && !o.engaged) o.engaged = e.id;
          else if (e && o.engaged) {
            const cur = this.get(o.engaged);
            if (cur && cur.kind === 'building' && e.kind === 'unit') o.engaged = e.id;
          }
        }
        const e = o.engaged && this.get(o.engaged);
        if (e && !e.hidden && this.gap(u.x, u.y, e).euc <= s.sight + 3) {
          this.engage(u, e, dt);
          break;
        }
        o.engaged = 0;
        const r = this.travel(u, o, 0, dt);
        if (r === 'there' || r === 'fail' || (u.fails >= 3 && Math.max(Math.abs(u.x - o.x), Math.abs(u.y - o.y)) <= 2)) u.order = null;
        break;
      }
      case 'attack': {
        const t = this.get(o.target);
        if (!t || t.hidden) {
          const next = u.type !== 'worker' && this.findEnemy(u.x, u.y, u.owner, s.sight);
          if (next) o.target = next.id;
          else u.order = null;
          break;
        }
        // No perseguir hasta el infinito si nadie lo mandó
        if (o.home && !o.forced && Math.hypot(u.x - o.home.x, u.y - o.home.y) > 9) {
          this.setOrder(u, { type: 'move', x: o.home.x, y: o.home.y });
          break;
        }
        this.engage(u, t, dt);
        break;
      }
      case 'harvest': this.doHarvest(u, o, dt); break;
      case 'return': this.doReturn(u, o, dt); break;
      case 'build': this.doBuild(u, o, dt); break;
      case 'repair': this.doRepair(u, o, dt); break;
    }
  }
  engage(u, t, dt) {
    if (u.moving) return;
    const s = this.stat(u);
    if (this.inRange(u, t)) { u.path = []; this.strike(u, t, dt); return; }
    if (s.minRange && this.gap(u.x, u.y, t).euc < s.minRange) return; // demasiado cerca
    const goal = t.kind === 'building' ? t : { x: t.x, y: t.y };
    const r = this.travel(u, goal, s.range <= 1 ? 1 : s.range, dt);
    if (r === 'fail') {
      const other = this.findEnemy(u.x, u.y, u.owner, s.range + 0.4);
      if (u.order.type === 'attack') u.order.target = other ? other.id : 0;
      else u.order.engaged = other ? other.id : 0;
      u.fails = 0;
    }
  }

  updateBuilding(b, dt) {
    if (b.hitT > 0) b.hitT -= dt;
    if (b.owner < 0) return;
    const d = BUILDINGS[b.type];
    if (!b.done) {
      const w = this.get(b.builderId);
      if (!w) return;
      const step = dt / d.time;
      b.progress = Math.min(1, b.progress + step);
      b.hp = Math.min(d.hp, b.hp + d.hp * 0.9 * step);
      if (b.progress >= 1) {
        b.done = true;
        w.order = null;
        this.showUnit(w, b);
        b.builderId = 0;
        this.recount();
        const c = this.center(b);
        this.emit('built', { owner: b.owner, x: c.x, y: c.y, name: this.name(b) });
      }
      return;
    }
    if (b.type === 'tower') {
      if (b.cd > 0) b.cd -= dt;
      else {
        const e = this.findEnemy(b.x, b.y, b.owner, d.range + 1);
        if (e && this.gap(e.x, e.y, b).euc <= d.range) {
          b.cd = d.cd;
          this.shoot(b, e, 'arrow', (d.dmg + this.players[b.owner].upg.arrow * 2) * (0.85 + this.rng() * 0.3));
        } else b.cd = 0.3;
      }
    }
    if (!b.queue.length) return;
    const q = b.queue[0], p = this.players[b.owner];
    if (!q.started) {
      if (q.kind === 'unit' && p.food + this.queueFood(b.owner) + UNITS[q.type].food > p.cap) {
        if (this.time - (p.foodWarn || -99) > 15) {
          p.foodWarn = this.time;
          this.msg(b.owner, 'Falta alimento: construí más ' + (p.faction === 'human' ? 'granjas.' : 'porquerizas.'));
        }
        return;
      }
      q.started = true;
    }
    q.t += dt;
    if (q.t < q.total) return;
    if (q.kind === 'upg') {
      p.upg[q.type]++;
      p.researching[q.type] = false;
      b.queue.shift();
      this.msg(b.owner, 'Mejora lista: ' + UPGRADES[q.type].name);
      this.emit('upgraded', { owner: b.owner });
      return;
    }
    const spot = this.spotAround(b, b.rally);
    if (!spot) return;
    b.queue.shift();
    const u = this.addUnit(q.type, b.owner, spot.x, spot.y);
    p.stats.trained++;
    this.recount();
    this.emit('trained', { owner: b.owner, utype: q.type, x: spot.x, y: spot.y });
    if (b.rally) {
      const i = b.rally.y * MAPW + b.rally.x;
      const mine = this.bld[i] && this.get(this.bld[i]);
      if (u.type === 'worker' && mine && mine.type === 'mine') this.cmdMine(b.owner, [u.id], mine.id);
      else if (u.type === 'worker' && this.terrain[i] === T_TREE) this.cmdChop(b.owner, [u.id], b.rally.x, b.rally.y);
      else this.cmdMove(b.owner, [u.id], b.rally.x, b.rally.y, true);
    }
  }

  recount() {
    for (const p of this.players) { p.food = 0; p.cap = 0; }
    for (const e of this.list) {
      if (e.dead || e.owner < 0) continue;
      const p = this.players[e.owner];
      if (e.kind === 'unit') p.food += UNITS[e.type].food;
      else if (e.done) p.cap += BUILDINGS[e.type].food || 0;
    }
    for (const p of this.players) p.cap = Math.min(MAX_FOOD, p.cap);
  }
  updateFog() {
    for (const p of this.players) p.visible.fill(0);
    for (const e of this.list) {
      if (e.dead || e.owner < 0 || e.hidden) continue;
      const p = this.players[e.owner];
      const w = e.kind === 'building' ? e.w : 1, h = e.kind === 'building' ? e.h : 1;
      let r = e.kind === 'unit' ? this.stat(e).sight : BUILDINGS[e.type].sight;
      if (e.kind === 'building' && !e.done) r = 2;
      const cx = e.x + (w - 1) / 2, cy = e.y + (h - 1) / 2;
      const R = r + (w - 1) / 2, R2 = (R + 0.5) * (R + 0.5);
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(MAPH - 1, Math.ceil(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(MAPW - 1, Math.ceil(cx + R)); x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= R2) {
            p.visible[y * MAPW + x] = 1;
            p.explored[y * MAPW + x] = 1;
          }
    }
  }

  tick(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const e = this.list[i];
      if (e.dead) continue;
      if (e.kind === 'unit') this.updateUnit(e, dt);
      else this.updateBuilding(e, dt);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const t = this.get(p.target);
      if (t && !p.splash) { const c = this.center(t); p.tx = c.x; p.ty = c.y; }
      if (p.t >= p.dur) { this.projectiles.splice(i, 1); this.impact(p); }
    }
    if (this.list.some(e => e.dead)) this.list = this.list.filter(e => !e.dead);
    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.25; this.updateFog(); }
  }
}
