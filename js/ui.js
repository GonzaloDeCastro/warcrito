// Menús, controles, panel lateral y bucle principal.
const $ = s => document.querySelector(s);
const STEP = 1 / 30;
const UI = {
  game: null, r: null, ais: [], me: 0, selection: [], groups: {},
  mouse: { x: 0, y: 0, inside: false }, drag: null, pan: null, keys: {},
  mode: null,          // 'attack' | 'move' | 'repair' | 'chop' | 'rally'
  placing: null, buildMenu: false, showBars: false,
  paused: false, speed: 1, acc: 0, last: 0, pings: [], lastAlert: null,
  cmds: [], cmdSig: null, infoT: 0,
  setup: { faction: 'human', map: 'valle', level: 'normal' },
};

// ───────── menú principal ─────────
function showScreen(html) {
  const s = $('#screen');
  s.innerHTML = html;
  s.classList.remove('hidden');
}
function hideScreen() { $('#screen').classList.add('hidden'); }

function showMenu() {
  UI.game = null;
  const st = UI.setup;
  const card = (f, title, text) => `
    <button class="faction ${f} ${st.faction === f ? 'on' : ''}" data-f="${f}">
      <canvas data-face="${f}" width="240" height="130"></canvas>
      <b>${title}</b><span>${text}</span>
    </button>`;
  const opts = (name, entries) => entries.map(([k, v]) =>
    `<button class="opt ${st[name] === k ? 'on' : ''}" data-k="${name}" data-v="${k}">${v}</button>`).join('');
  showScreen(`
    <div class="panel menu">
      <h1>Hierro <i>y</i> Colmillo</h1>
      <p class="sub">Estrategia en tiempo real · Humanos contra Orcos</p>
      <div class="factions">
        ${card('human', 'Humanos', 'Disciplina y fe. Caballeros veloces y clérigos que curan.')}
        ${card('orc', 'Orcos', 'Fuerza bruta. Ogros enormes y chamanes que desatan la Furia.')}
      </div>
      <div class="row"><label>Mapa</label>${opts('map', Object.entries(MAPS).map(([k, m]) => [k, m.name]))}</div>
      <p class="hint">${MAPS[st.map].desc}</p>
      <div class="row"><label>Rival</label>${opts('level', Object.entries(AI_LEVELS).map(([k, l]) => [k, l.name]))}</div>
      <div class="row center">
        <button class="big" id="start">¡A la guerra!</button>
        <button id="how">Cómo se juega</button>
      </div>
    </div>`);
  for (const c of document.querySelectorAll('canvas[data-face]')) paintFace(c, c.dataset.face);
  for (const b of document.querySelectorAll('.faction')) b.onclick = () => { st.faction = b.dataset.f; showMenu(); };
  for (const b of document.querySelectorAll('.opt')) b.onclick = () => { st[b.dataset.k] = b.dataset.v; showMenu(); };
  $('#start').onclick = () => { Snd.init(); startGame(); };
  $('#how').onclick = () => showHelp(showMenu);
}

function paintFace(canvas, f) {
  const g = canvas.getContext('2d');
  const types = ['ranged', 'melee', 'cavalry', 'caster', 'worker'];
  const place = [[44, 106, 1.8], [96, 118, 2.3], [158, 116, 1.9], [206, 108, 1.8], [18, 122, 1.4]];
  for (const i of [0, 3, 4, 2, 1]) {
    const [x, y, s] = place[i];
    const view = types[i] === 'cavalry' && f === 'human' ? 'side' : 'front';
    oval(g, x, y, 11 * s, 4 * s, 'rgba(0,0,0,0.35)', 0);
    g.drawImage(unitSprite(f, types[i], view, 0, false), x - USPR.ax * s, y - USPR.ay * s, USPR.w * s, USPR.h * s);
  }
}

function showHelp(back) {
  showScreen(`
    <div class="panel help">
      <h2>Cómo se juega</h2>
      <p><b>Objetivo:</b> destruir todos los edificios enemigos.</p>
      <ol>
        <li>Mandá obreros a la <b>mina de oro</b> y a los <b>árboles</b> (clic derecho).</li>
        <li>Entrená más obreros en el edificio principal.</li>
        <li>Construí <b>granjas</b> o porquerizas para tener alimento.</li>
        <li><b>Cuartel</b> → soldados. <b>Aserradero</b> → arqueros. <b>Herrería</b> → mejoras y catapultas.
            <b>Establo</b> → caballeros u ogros. <b>Iglesia</b> o altar → clérigos o chamanes.</li>
        <li>Armá un ejército, defendé tu base y atacá.</li>
      </ol>
      <table>
        <tr><td>Clic / arrastrar</td><td>Seleccionar (doble clic: todos los del mismo tipo)</td></tr>
        <tr><td>Clic derecho</td><td>Mover, atacar, juntar, reparar o fijar punto de reunión</td></tr>
        <tr><td>A + clic</td><td>Avanzar atacando todo lo que aparezca</td></tr>
        <tr><td>M · S · H</td><td>Mover · Detener · Mantener posición</td></tr>
        <tr><td>B</td><td>Menú de construcción (con un obrero)</td></tr>
        <tr><td>Ctrl + 1…9 / 1…9</td><td>Guardar grupo / seleccionarlo (dos veces: ir)</td></tr>
        <tr><td>Flechas, borde, botón del medio</td><td>Mover la cámara</td></tr>
        <tr><td>Rueda</td><td>Acercar y alejar</td></tr>
        <tr><td>. (punto)</td><td>Obrero ocioso</td></tr>
        <tr><td>Espacio</td><td>Ir al último ataque o aviso</td></tr>
        <tr><td>Alt (mantener)</td><td>Ver barras de vida</td></tr>
        <tr><td>F10 o Esc</td><td>Pausa y menú</td></tr>
      </table>
      <div class="row center"><button class="big" id="back">Volver</button></div>
    </div>`);
  $('#back').onclick = back;
}

function showPause() {
  if (!UI.game || UI.game.winner !== null) return;
  UI.paused = true;
  showScreen(`
    <div class="panel small">
      <h2>Pausa</h2>
      <button class="big" id="resume">Seguir jugando</button>
      <div class="row center"><label>Velocidad</label>
        ${[0.75, 1, 1.5, 2].map(v => `<button class="opt ${UI.speed === v ? 'on' : ''}" data-s="${v}">${v}×</button>`).join('')}
      </div>
      <button id="snd">Sonido: ${Snd.on ? 'sí' : 'no'}</button>
      <button id="help">Cómo se juega</button>
      <button id="restart">Reiniciar partida</button>
      <button id="quit">Menú principal</button>
    </div>`);
  $('#resume').onclick = resume;
  for (const b of document.querySelectorAll('[data-s]')) b.onclick = () => { UI.speed = +b.dataset.s; showPause(); };
  $('#snd').onclick = () => { Snd.toggle(); showPause(); };
  $('#help').onclick = () => showHelp(showPause);
  $('#restart').onclick = startGame;
  $('#quit').onclick = showMenu;
}
function resume() { UI.paused = false; hideScreen(); }

function showEnd() {
  const g = UI.game, won = g.winner === UI.me;
  const t = Math.floor(g.time);
  const row = (label, key) => `<tr><td>${label}</td><td>${g.players[UI.me].stats[key]}</td><td>${g.players[1 - UI.me].stats[key]}</td></tr>`;
  Snd.play(won ? 'win' : 'lose');
  showScreen(`
    <div class="panel small">
      <h1 class="${won ? 'win' : 'lose'}">${won ? '¡Victoria!' : 'Derrota'}</h1>
      <p>Duración: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</p>
      <table class="stats">
        <tr><th></th><th>Vos</th><th>Rival</th></tr>
        ${row('Unidades entrenadas', 'trained')}${row('Unidades perdidas', 'lost')}
        ${row('Edificios destruidos', 'razed')}${row('Oro juntado', 'gold')}${row('Madera juntada', 'wood')}
      </table>
      <button class="big" id="again">Jugar de nuevo</button>
      <button id="quit">Menú principal</button>
    </div>`);
  $('#again').onclick = startGame;
  $('#quit').onclick = showMenu;
}

// ───────── partida ─────────
function startGame() {
  const st = UI.setup;
  const other = st.faction === 'human' ? 'orc' : 'human';
  const g = new Game({ map: st.map, seed: (Math.random() * 1e9) | 0, factions: [st.faction, other] });
  UI.game = g;
  UI.me = 0;
  UI.ais = [new AI(g, 1, st.level)];
  UI.r = new Renderer(g, $('#view'), $('#mini'), 0);
  UI.selection = []; UI.groups = {}; UI.pings = []; UI.lastAlert = null;
  UI.mode = null; UI.placing = null; UI.buildMenu = false; UI.paused = false; UI.cmdSig = null;
  UI.acc = 0; UI.ended = false;
  $('#log').innerHTML = '';
  hideScreen();
  const base = g.bases[0];
  UI.r.centerOn(base.x + 3, base.y + 1);
  say(st.faction === 'human'
    ? 'Mandá a tus campesinos a la mina y al bosque. ¡Los orcos no van a esperar!'
    : '¡Peones, al oro! Aplasten a los humanos antes de que levanten sus muros.');
}

function say(text, bad) {
  const log = $('#log');
  const d = document.createElement('div');
  d.textContent = text;
  if (bad) d.className = 'bad';
  log.appendChild(d);
  while (log.children.length > 4) log.firstChild.remove();
  setTimeout(() => d.remove(), 7000);
}

function handleEvents() {
  const g = UI.game, mine = UI.me, faction = g.players[mine].faction;
  for (const ev of g.events) {
    UI.r.onEvent(ev);
    const seen = ev.x === undefined || (g.inb(Math.floor(ev.x), Math.floor(ev.y)) && g.players[mine].visible[Math.floor(ev.y) * MAPW + Math.floor(ev.x)]);
    const onScreen = ev.x !== undefined && seen && isOnScreen(ev.x, ev.y);
    switch (ev.type) {
      case 'msg':
        if (ev.owner !== mine) break;
        say(ev.text);
        if (/No |Falta|Necesit|llena|Sin /.test(ev.text)) Snd.play('error');
        break;
      case 'alert':
        if (ev.owner !== mine) break;
        UI.pings.push({ x: ev.x, y: ev.y, t: 0 });
        UI.lastAlert = { x: ev.x, y: ev.y };
        say(ev.building ? '¡Atacan tu base!' : '¡Tus unidades están bajo ataque!', true);
        Snd.play('alert', faction);
        break;
      case 'built':
        if (ev.owner !== mine) break;
        say('Obra terminada: ' + ev.name);
        UI.lastAlert = { x: ev.x, y: ev.y };
        Snd.play('built'); UI.cmdSig = null;
        break;
      case 'trained': if (ev.owner === mine) Snd.play('trained', faction); break;
      case 'wave':
        if (ev.owner === mine) { say('Se oyen cuernos de guerra… el enemigo avanza.', true); Snd.play('horn'); }
        break;
      case 'end': break;
      default:
        if (onScreen) Snd.play(ev.type === 'collapse' ? 'boom' : ev.type);
    }
  }
  g.events.length = 0;
}
function isOnScreen(tx, ty) {
  const c = UI.r.cam, v = UI.r.canvas;
  const x = (tx * TILE - c.x) * c.z, y = (ty * TILE - c.y) * c.z;
  return x > -40 && y > -40 && x < v.clientWidth + 40 && y < v.clientHeight + 40;
}

// ───────── selección ─────────
function select(list) {
  UI.selection = list;
  UI.mode = null; UI.placing = null; UI.buildMenu = false; UI.cmdSig = null;
  if (list.length && list[0].owner === UI.me) Snd.play('select', UI.game.players[UI.me].faction);
}
const myUnits = () => UI.selection.filter(e => !e.dead && e.kind === 'unit' && e.owner === UI.me);
const myIds = () => UI.selection.filter(e => !e.dead && e.owner === UI.me).map(e => e.id);

function boxSelect(a, b, add) {
  const g = UI.game, r = UI.r;
  const p0 = r.toWorld(Math.min(a.x, b.x), Math.min(a.y, b.y)), p1 = r.toWorld(Math.max(a.x, b.x), Math.max(a.y, b.y));
  let found = g.list.filter(e => {
    if (e.dead || e.kind !== 'unit' || e.owner !== UI.me || e.hidden) return false;
    const x = (e.px + 0.5) * TILE, y = (e.py + 0.5) * TILE;
    return x >= p0.x - 6 && x <= p1.x + 6 && y >= p0.y - 6 && y <= p1.y + 10;
  });
  // Si hay militares, los obreros quedan afuera
  if (found.some(u => u.type !== 'worker')) found = found.filter(u => u.type !== 'worker');
  if (add) found = [...new Set([...myUnits(), ...found])];
  if (found.length) select(found.slice(0, 24));
}

function clickSelect(sx, sy, add, dbl) {
  const w = UI.r.toWorld(sx, sy);
  const e = UI.r.pick(w.x, w.y);
  if (!e) { if (!add) select([]); return; }
  if (e.owner === UI.me && e.kind === 'unit') {
    if (dbl) {
      select(UI.game.list.filter(u => !u.dead && !u.hidden && u.kind === 'unit' && u.owner === UI.me && u.type === e.type && isOnScreen(u.px + 0.5, u.py + 0.5)).slice(0, 24));
      return;
    }
    if (add) {
      const cur = myUnits();
      select(cur.includes(e) ? cur.filter(u => u !== e) : [...cur, e].slice(0, 24));
      return;
    }
  }
  select([e]);
}

function tileAt(sx, sy) {
  const w = UI.r.toWorld(sx, sy);
  return {
    x: Math.max(0, Math.min(MAPW - 1, Math.floor(w.x / TILE))),
    y: Math.max(0, Math.min(MAPH - 1, Math.floor(w.y / TILE))),
  };
}

// Clic derecho (o clic con una orden elegida)
function command(tile, target, mode) {
  const g = UI.game, ids = myIds(), me = UI.me;
  if (!ids.length) return;
  const units = myUnits();
  let color = '#6dff5a';
  if (!units.length) {
    g.cmdSmart(me, ids, tile.x, tile.y, target);
  } else if (mode === 'attack') {
    color = '#ff5a46';
    if (target && target.type !== 'mine') g.cmdAttack(me, ids, target.id);
    else g.cmdMove(me, ids, tile.x, tile.y, true);
  } else if (mode === 'move') {
    g.cmdMove(me, ids, tile.x, tile.y);
  } else if (mode === 'repair') {
    if (!target || target.kind !== 'building' || target.owner !== me) { say('Elegí un edificio tuyo dañado.'); return; }
    g.cmdRepair(me, ids, target.id);
  } else if (mode === 'chop') {
    if (target && target.type === 'mine') g.cmdMine(me, ids, target.id);
    else if (g.terrain[tile.y * MAPW + tile.x] === T_TREE) g.cmdChop(me, ids, tile.x, tile.y);
    else { say('Elegí una mina o un árbol.'); return; }
    color = '#ffd23a';
  } else {
    const r = g.cmdSmart(me, ids, tile.x, tile.y, target);
    if (r === 'attack') color = '#ff5a46';
    if (r === 'harvest') color = '#ffd23a';
  }
  UI.r.addFx('order', tile.x + 0.5, tile.y + 0.6, { color });
  if (units.length) Snd.play('ack', g.players[me].faction);
}

function tryPlace(tile, keep) {
  const g = UI.game, type = UI.placing, d = BUILDINGS[type];
  const w = UI.r.toWorld(UI.mouse.x, UI.mouse.y);
  const tx = Math.round(w.x / TILE - d.w / 2), ty = Math.round(w.y / TILE - d.h / 2);
  const workers = myUnits().filter(u => u.type === 'worker' && !u.hidden);
  if (!workers.length) { UI.placing = null; return; }
  // Va el obrero libre más cercano
  workers.sort((a, b) => ((a.order && a.order.type === 'build') - (b.order && b.order.type === 'build'))
    || Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty));
  if (g.cmdBuild(UI.me, workers[0].id, type, tx, ty)) {
    Snd.play('ack', g.players[UI.me].faction);
    UI.r.addFx('order', tx + d.w / 2, ty + d.h / 2, { color: '#7fc4ff' });
    if (!keep) { UI.placing = null; UI.buildMenu = false; UI.cmdSig = null; }
  }
}

// ───────── botonera ─────────
function costText(gold, wood, food) {
  return [gold ? `<span class="g">${gold} oro</span>` : '', wood ? `<span class="w">${wood} madera</span>` : '', food ? `<span>${food} alimento</span>` : ''].filter(Boolean).join(' · ');
}

function buildCommands() {
  const g = UI.game, me = UI.me, p = g.players[me], f = p.faction;
  const sel = UI.selection.filter(e => !e.dead);
  const out = [];
  const add = (c) => out.push(c);
  if (!sel.length || sel[0].owner !== me) return out;
  const units = myUnits();
  if (units.length) {
    const workers = units.filter(u => u.type === 'worker');
    if (UI.buildMenu && workers.length) {
      for (const t of BUILD_ORDER_MENU) {
        const d = BUILDINGS[t], miss = g.missing(me, d.needs);
        add({
          key: d.key, icon: ['building', t], title: d.names[f], cost: costText(d.gold, d.wood),
          desc: d.desc + (miss.length ? ` <em>Requiere: ${miss.join(', ')}</em>` : ''),
          off: miss.length > 0, poor: !g.canPay(me, d.gold, d.wood), on: UI.placing === t,
          run: () => { if (!g.canPay(me, d.gold, d.wood)) { say('No alcanzan los recursos.'); Snd.play('error'); return; } UI.placing = t; UI.mode = null; },
        });
      }
      add({ key: 'X', icon: ['cmd', 'cancel'], title: 'Volver', desc: '', run: () => { UI.buildMenu = false; UI.placing = null; } });
      return out;
    }
    const mode = (m) => () => { UI.mode = m; UI.placing = null; };
    add({ key: 'M', icon: ['cmd', 'move'], title: 'Mover', desc: 'Ir a un punto sin pelear.', on: UI.mode === 'move', run: mode('move') });
    add({ key: 'S', icon: ['cmd', 'stop'], title: 'Detener', desc: 'Cancelar la orden actual.', run: () => g.cmdStop(me, myIds()) });
    add({ key: 'H', icon: ['cmd', 'hold'], title: 'Mantener posición', desc: 'Atacar solo a lo que esté al alcance, sin perseguir.', run: () => g.cmdHold(me, myIds()) });
    add({ key: 'A', icon: ['cmd', 'attack'], title: 'Atacar', desc: 'Elegí un enemigo, o un punto para avanzar atacando.', on: UI.mode === 'attack', run: mode('attack') });
    if (workers.length) {
      add({ key: 'B', icon: ['cmd', 'build'], title: 'Construir', desc: 'Abrir el menú de edificios.', run: () => { UI.buildMenu = true; UI.mode = null; } });
      add({ key: 'G', icon: ['cmd', 'chop'], title: 'Juntar', desc: 'Elegí una mina de oro o un árbol.', on: UI.mode === 'chop', run: mode('chop') });
      add({ key: 'R', icon: ['cmd', 'repair'], title: 'Reparar', desc: 'Arreglar un edificio dañado (gasta oro y madera).', on: UI.mode === 'repair', run: mode('repair') });
      if (workers.some(w => w.carry)) add({ key: 'V', icon: ['cmd', 'return'], title: 'Entregar carga', desc: '', run: () => g.cmdReturn(me, myIds()) });
    }
    return out;
  }
  const b = sel[0];
  if (b.kind !== 'building') return out;
  if (!b.done) {
    add({ key: 'X', icon: ['cmd', 'cancel'], title: 'Cancelar obra', desc: 'Devuelve el 75% de lo gastado.', run: () => { g.cmdCancel(me, b.id); select([]); } });
    return out;
  }
  for (const t in UNITS) {
    const d = UNITS[t];
    if (d.from !== b.type) continue;
    const s = UNIT_CACHE[f][t], miss = g.missing(me, d.needs);
    add({
      key: d.key, icon: ['unit', t], title: 'Entrenar ' + d.names[f], cost: costText(d.gold, d.wood, d.food),
      desc: `${s.desc} Vida ${s.hp} · Daño ${s.dmg} · Armadura ${s.arm}` + (miss.length ? ` <em>Requiere: ${miss.join(', ')}</em>` : ''),
      off: miss.length > 0, poor: !g.canPay(me, d.gold, d.wood), run: () => g.cmdTrain(me, b.id, t),
    });
  }
  for (const k in UPGRADES) {
    const d = UPGRADES[k];
    if (d.at !== b.type) continue;
    const lvl = p.upg[k];
    if (lvl >= d.max || p.researching[k]) continue;
    add({
      key: d.key, icon: ['cmd', k], title: `${d.name} (nivel ${lvl + 1})`, cost: costText(d.gold[lvl], d.wood[lvl]), desc: d.desc,
      poor: !g.canPay(me, d.gold[lvl], d.wood[lvl]), run: () => g.cmdResearch(me, b.id, k),
    });
  }
  if (b.queue.length) add({ key: 'X', icon: ['cmd', 'cancel'], title: 'Cancelar último', desc: 'Devuelve todo lo gastado.', run: () => g.cmdCancel(me, b.id) });
  return out;
}

function runCommand(c) {
  if (!c) return;
  if (c.off) { Snd.play('error'); say(c.desc.replace(/.*<em>|<\/em>/g, '')); return; }
  Snd.play('click');
  c.run();
  UI.cmdSig = null;
  handleEvents();
}

function refreshCommands() {
  UI.cmds = buildCommands();
  const sig = UI.cmds.map(c => c.title + (c.off ? 'x' : '') + (c.poor ? 'p' : '') + (c.on ? 'o' : '')).join('|');
  if (sig === UI.cmdSig) return;
  UI.cmdSig = sig;
  const box = $('#cmds');
  box.innerHTML = '';
  $('#tip').classList.add('hidden');
  const f = UI.game.players[UI.me].faction;
  UI.cmds.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'cmd' + (c.off ? ' off' : '') + (c.poor ? ' poor' : '') + (c.on ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 88;
    cv.getContext('2d').drawImage(iconCanvas(c.icon[0], c.icon[1], f), 0, 0, 88, 88);
    const k = document.createElement('kbd');
    k.textContent = c.key;
    b.append(cv, k);
    b.onclick = () => runCommand(UI.cmds[i]);
    b.onmouseenter = () => {
      const t = $('#tip');
      t.innerHTML = `<b>${c.title}</b> <kbd>${c.key}</kbd>${c.cost ? `<div>${c.cost}</div>` : ''}<p>${c.desc || ''}</p>`;
      t.classList.remove('hidden');
    };
    b.onmouseleave = () => $('#tip').classList.add('hidden');
    box.appendChild(b);
  });
}

// ───────── panel de información ─────────
function refreshInfo() {
  const g = UI.game, me = UI.me, p = g.players[me];
  $('#gold').textContent = Math.floor(p.gold);
  $('#wood').textContent = Math.floor(p.wood);
  $('#food').textContent = `${p.food} / ${p.cap}`;
  $('#food').parentElement.classList.toggle('full', p.food >= p.cap);
  const t = Math.floor(g.time);
  $('#clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const idle = g.list.filter(u => !u.dead && u.owner === me && u.type === 'worker' && !u.order && !u.hidden).length;
  $('#idle').textContent = `Obreros ociosos: ${idle}`;
  $('#idle').classList.toggle('hidden', !idle);

  const sel = UI.selection;
  const info = $('#info');
  if (!sel.length) { info.innerHTML = '<p class="dim">Seleccioná unidades o edificios.</p>'; UI.infoSig = ''; return; }
  const icon = (e, size) => {
    const f = e.owner >= 0 ? g.players[e.owner].faction : 'human';
    return `<canvas width="88" height="88" style="width:${size}px;height:${size}px" data-ic="${e.kind}:${e.type}:${f}"></canvas>`;
  };
  let html = '';
  if (sel.length > 1) {
    html = '<div class="multi">' + sel.map((u, i) => `<button data-i="${i}">${icon(u, 34)}<i style="width:${Math.round(u.hp / g.maxHp(u) * 100)}%"></i></button>`).join('') + '</div>';
  } else {
    const e = sel[0];
    const owner = e.owner < 0 ? '' : e.owner === me ? '' : ' <span class="enemy">(enemigo)</span>';
    html = `<div class="one">${icon(e, 52)}<div><b>${g.name(e)}</b>${owner}`;
    if (e.type === 'mine') html += `<div class="g">Oro restante: ${e.gold}</div></div></div><p class="dim">${BUILDINGS.mine.desc}</p>`;
    else {
      html += `<div>Vida ${Math.ceil(e.hp)} / ${g.maxHp(e)}</div></div></div>`;
      if (e.kind === 'unit') {
        const s = g.stat(e);
        html += `<p>Daño ${Math.round(g.dmgOf(e))} · Armadura ${g.armorOf(e)}${s.range > 1 ? ` · Alcance ${s.range}` : ''}</p>`;
        if (s.mana) html += `<p class="mana">Energía ${Math.floor(e.mana)} / ${s.mana}</p>`;
        if (e.carry) html += `<p class="dim">Lleva ${e.carry.amt} de ${e.carry.type === 'gold' ? 'oro' : 'madera'}.</p>`;
        if (e.buffT > 0) html += '<p class="enemy">¡Furia!</p>';
      } else if (!e.done) {
        html += `<p>En construcción: ${Math.floor(e.progress * 100)}%</p>`;
      } else if (e.owner === me && e.queue.length) {
        const q = e.queue[0];
        const nm = q.kind === 'unit' ? UNITS[q.type].names[p.faction] : UPGRADES[q.type].name;
        html += `<p>${nm}${q.started ? '' : ' (falta alimento)'}</p><div class="bar"><i style="width:${Math.floor(q.t / q.total * 100)}%"></i></div>`;
        if (e.queue.length > 1) html += `<p class="dim">En cola: ${e.queue.slice(1).map(x => x.kind === 'unit' ? UNITS[x.type].names[p.faction] : UPGRADES[x.type].name).join(', ')}</p>`;
      } else {
        const d = BUILDINGS[e.type];
        html += `<p class="dim">${d.desc}</p>`;
      }
    }
  }
  // Solo se reescribe si cambió, para no romper los clics
  if (html === UI.infoSig) return;
  UI.infoSig = html;
  info.innerHTML = html;
  for (const c of info.querySelectorAll('canvas[data-ic]')) {
    const [kind, type, f] = c.dataset.ic.split(':');
    c.getContext('2d').drawImage(iconCanvas(kind, type, f), 0, 0, 88, 88);
  }
  for (const b of info.querySelectorAll('button[data-i]')) b.onclick = (ev) => {
    const u = UI.selection[+b.dataset.i];
    if (!u) return;
    select(ev.shiftKey ? UI.selection.filter(x => x !== u) : [u]);
  };
}

function idleWorker() {
  const list = UI.game.list.filter(u => !u.dead && u.owner === UI.me && u.type === 'worker' && !u.order && !u.hidden);
  if (!list.length) return;
  const cur = UI.selection.length === 1 ? list.indexOf(UI.selection[0]) : -1;
  const u = list[(cur + 1) % list.length];
  select([u]);
  UI.r.centerOn(u.px, u.py);
}

// ───────── controles ─────────
function bindInput() {
  const view = $('#view'), mini = $('#mini');
  const pos = e => { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  view.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('contextmenu', e => e.preventDefault());

  view.addEventListener('mousedown', e => {
    if (!UI.game || UI.paused) return;
    Snd.init();
    const m = pos(e);
    Object.assign(UI.mouse, m);
    if (e.button === 1) { e.preventDefault(); UI.pan = { x: e.clientX, y: e.clientY }; return; }
    const w = UI.r.toWorld(m.x, m.y);
    if (e.button === 2) {
      if (UI.placing || UI.mode) { UI.placing = null; UI.mode = null; return; }
      command(tileAt(m.x, m.y), UI.r.pick(w.x, w.y));
      return;
    }
    if (UI.placing) { tryPlace(tileAt(m.x, m.y), e.shiftKey); handleEvents(); return; }
    if (UI.mode) {
      command(tileAt(m.x, m.y), UI.r.pick(w.x, w.y), UI.mode);
      UI.mode = null;
      return;
    }
    UI.drag = { x: m.x, y: m.y, active: false };
  });
  window.addEventListener('mousemove', e => {
    if (!UI.game) return;
    const r = view.getBoundingClientRect();
    UI.mouse.x = e.clientX - r.left; UI.mouse.y = e.clientY - r.top;
    UI.mouse.cx = e.clientX; UI.mouse.cy = e.clientY;
    UI.mouse.inside = e.target === view;
    if (UI.drag && Math.hypot(UI.mouse.x - UI.drag.x, UI.mouse.y - UI.drag.y) > 5) UI.drag.active = true;
    if (UI.pan) {
      UI.r.cam.x -= (e.clientX - UI.pan.x) / UI.r.cam.z;
      UI.r.cam.y -= (e.clientY - UI.pan.y) / UI.r.cam.z;
      UI.pan = { x: e.clientX, y: e.clientY };
      UI.r.clampCam();
    }
    if (UI.miniDrag) miniGo(e);
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 1) UI.pan = null;
    if (e.button !== 0) return;
    UI.miniDrag = false;
    if (!UI.drag || !UI.game) { UI.drag = null; return; }
    const m = pos(e);
    if (UI.drag.active) boxSelect(UI.drag, m, e.shiftKey);
    else clickSelect(m.x, m.y, e.shiftKey, e.detail >= 2 || e.ctrlKey);
    UI.drag = null;
  });
  document.addEventListener('mouseleave', () => { UI.mouse.cx = undefined; });
  view.addEventListener('wheel', e => {
    if (!UI.game) return;
    e.preventDefault();
    const m = pos(e), before = UI.r.toWorld(m.x, m.y);
    UI.r.cam.z = Math.max(0.7, Math.min(2.2, UI.r.cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    UI.r.cam.x = before.x - m.x / UI.r.cam.z;
    UI.r.cam.y = before.y - m.y / UI.r.cam.z;
    UI.r.clampCam();
  }, { passive: false });

  const miniTile = e => {
    const r = mini.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(MAPW - 1, Math.floor((e.clientX - r.left) / r.width * MAPW))),
      y: Math.max(0, Math.min(MAPH - 1, Math.floor((e.clientY - r.top) / r.height * MAPH))),
    };
  };
  function miniGo(e) { const t = miniTile(e); UI.r.centerOn(t.x, t.y); }
  mini.addEventListener('mousedown', e => {
    if (!UI.game || UI.paused) return;
    Snd.init();
    const t = miniTile(e);
    if (e.button === 2) { command(t, null, UI.mode === 'attack' ? 'attack' : null); UI.mode = null; }
    else if (e.button === 0) {
      if (UI.mode === 'attack' || UI.mode === 'move') { command(t, null, UI.mode); UI.mode = null; }
      else { UI.miniDrag = true; miniGo(e); }
    }
  });

  window.addEventListener('keydown', e => {
    if (!UI.game || UI.game.winner !== null) return;
    if (e.key === 'F10' || (e.key === 'Escape' && !UI.placing && !UI.mode && !UI.buildMenu)) {
      e.preventDefault();
      if (UI.paused) resume(); else showPause();
      return;
    }
    if (UI.paused) return;
    if (e.key === 'Alt') { e.preventDefault(); UI.showBars = true; return; }
    if (e.key === 'Escape') {
      if (UI.placing) UI.placing = null; else if (UI.mode) UI.mode = null; else UI.buildMenu = false;
      return;
    }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); UI.keys[e.key] = true; return; }
    if (/^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      const n = e.code.slice(5);
      if (e.ctrlKey || e.metaKey || e.altKey) {
        UI.groups[n] = myIds();
        if (UI.groups[n].length) say(`Grupo ${n} guardado.`);
      } else {
        const list = (UI.groups[n] || []).map(id => UI.game.get(id)).filter(x => x && !x.hidden);
        if (!list.length) return;
        const now = performance.now();
        if (UI.lastGroup === n && now - UI.lastGroupT < 400) {
          const c = UI.game.center(list[0]);
          UI.r.centerOn(c.x, c.y);
        }
        UI.lastGroup = n; UI.lastGroupT = now;
        select(list);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (UI.lastAlert) UI.r.centerOn(UI.lastAlert.x, UI.lastAlert.y);
      return;
    }
    if (e.key === '.') { idleWorker(); return; }
    const key = e.key.toUpperCase();
    refreshCommands();
    runCommand(UI.cmds.find(c => c.key === key));
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'Alt') { e.preventDefault(); UI.showBars = false; }
    delete UI.keys[e.key];
  });
  window.addEventListener('blur', () => { UI.keys = {}; UI.showBars = false; UI.mouse.cx = undefined; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && UI.game && !UI.paused) showPause(); });
  window.addEventListener('beforeunload', e => {
    if (UI.game && UI.game.winner === null && UI.game.time > 30) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#menubtn').onclick = () => { if (UI.paused) resume(); else showPause(); };
  $('#idle').onclick = idleWorker;
}

function scrollCamera(dt) {
  let dx = 0, dy = 0;
  const k = UI.keys, m = UI.mouse;
  if (k.ArrowLeft) dx--; if (k.ArrowRight) dx++;
  if (k.ArrowUp) dy--; if (k.ArrowDown) dy++;
  // borde de la ventana
  if (m.cx !== undefined && !UI.drag && !UI.pan && document.hasFocus()) {
    if (m.cx <= 3) dx--; else if (m.cx >= window.innerWidth - 4) dx++;
    if (m.cy <= 3) dy--; else if (m.cy >= window.innerHeight - 4) dy++;
  }
  if (dx || dy) {
    UI.r.cam.x += dx * 700 * dt / UI.r.cam.z;
    UI.r.cam.y += dy * 700 * dt / UI.r.cam.z;
    UI.r.clampCam();
  }
}

// ───────── bucle ─────────
function advanceGame(dt) {
  const g = UI.game;
  UI.acc += dt * UI.speed;
  let n = 0;
  while (UI.acc >= STEP && n++ < 8) {
    UI.acc -= STEP;
    for (const a of UI.ais) a.update(STEP);
    g.tick(STEP);
    handleEvents();
  }
  if (n >= 8) UI.acc = 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - UI.last) / 1000 || 0);
  UI.last = now;
  const g = UI.game;
  if (!g) return;
  if (!UI.paused) {
    scrollCamera(dt);
    if (g.winner === null) advanceGame(dt);
    UI.r.update(dt * UI.speed);
    for (const p of UI.pings) p.t += dt;
    UI.pings = UI.pings.filter(p => p.t < 4);
  }
  // Quitar de la selección lo que murió o ya no se ve
  const alive = UI.selection.filter(e => !e.dead && !e.hidden && UI.r.visibleEnt(e));
  if (alive.length !== UI.selection.length) { UI.selection = alive; UI.cmdSig = null; if (!alive.length) { UI.buildMenu = false; UI.placing = null; UI.mode = null; } }
  UI.r.draw(UI);
  UI.infoT -= dt;
  if (UI.infoT <= 0) {
    UI.infoT = 0.12;
    refreshInfo();
    refreshCommands();
    UI.r.drawMini(UI.pings);
  }
  $('#view').style.cursor = UI.mode || UI.placing ? 'crosshair' : 'default';
  $('#modehint').textContent = UI.placing ? 'Clic para construir (Shift: seguir) · Clic derecho: cancelar'
    : UI.mode ? 'Elegí el objetivo · Clic derecho: cancelar' : '';
  if (g.winner !== null && !UI.ended) { UI.ended = true; showEnd(); }
}

window.addEventListener('load', () => {
  bindInput();
  showMenu();
  requestAnimationFrame(frame);
});
