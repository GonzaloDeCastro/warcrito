// Datos del juego: facciones, unidades, edificios y mejoras.
const TILE = 32;
const MAPW = 72, MAPH = 72;
const T_GRASS = 0, T_TREE = 1, T_WATER = 2, T_ROCK = 3, T_DIRT = 4, T_STUMP = 5, T_BRIDGE = 6;

const FACTIONS = {
  human: { name: 'Humanos', color: '#3f74d8', dark: '#24478f', light: '#8fb4ff' },
  orc:   { name: 'Orcos',   color: '#c8402f', dark: '#7e231a', light: '#ff8a70' },
};

// dmg: daño, arm: armadura, range: alcance en casillas, cd: segundos entre golpes,
// speed: casillas por segundo, time: segundos de entrenamiento
const UNITS = {
  worker:  { names: { human: 'Campesino', orc: 'Peón' }, hp: 40, dmg: 5, arm: 0, range: 1, cd: 1.2, speed: 2.7, sight: 5,
             gold: 75, wood: 0, food: 1, time: 12, key: 'C', from: 'hall',
             desc: 'Junta oro y madera, construye y repara.' },
  melee:   { names: { human: 'Soldado', orc: 'Bruto' }, hp: 70, dmg: 10, arm: 3, range: 1, cd: 1.1, speed: 2.6, sight: 5,
             gold: 130, wood: 0, food: 1, time: 15, key: 'S', from: 'barracks',
             desc: 'Infantería resistente cuerpo a cuerpo.' },
  ranged:  { names: { human: 'Arquero', orc: 'Lanzahachas' }, hp: 45, dmg: 8, arm: 0, range: 5, cd: 1.4, speed: 2.7, sight: 7,
             gold: 110, wood: 50, food: 1, time: 16, key: 'A', from: 'barracks', needs: ['mill'],
             desc: 'Ataca a distancia. Frágil de cerca.' },
  cavalry: { names: { human: 'Caballero', orc: 'Ogro' }, hp: 130, dmg: 16, arm: 4, range: 1, cd: 1.3, speed: 3.9, sight: 6,
             gold: 220, wood: 60, food: 2, time: 24, key: 'K', from: 'barracks', needs: ['stable'],
             desc: 'Unidad pesada de élite.' },
  siege:   { names: { human: 'Catapulta', orc: 'Catapulta' }, hp: 75, dmg: 40, arm: 0, range: 8, minRange: 2, cd: 4.2, speed: 1.5, sight: 9,
             gold: 250, wood: 150, food: 2, time: 28, key: 'T', from: 'barracks', needs: ['smith', 'mill'], splash: 1.3,
             desc: 'Demuele edificios y grupos. No dispara de muy cerca.' },
  caster:  { names: { human: 'Clérigo', orc: 'Chamán' }, hp: 50, dmg: 7, arm: 0, range: 4, cd: 1.7, speed: 2.5, sight: 7,
             gold: 150, wood: 50, food: 1, time: 20, key: 'L', from: 'temple', mana: 100,
             desc: '' },
};
// Rasgos propios de cada raza
const FACTION_MODS = {
  human: { cavalry: { hp: 120, speed: 4.2 }, caster: { desc: 'Cura solo a los aliados heridos cercanos.' } },
  orc:   { cavalry: { hp: 155, dmg: 18, speed: 3.3, arm: 3 }, caster: { desc: 'Desata la Furia: aliados con +50% de daño.' } },
};
function unitStat(type, faction) {
  return Object.assign({}, UNITS[type], (FACTION_MODS[faction] || {})[type] || {});
}
const UNIT_CACHE = {};
for (const f of ['human', 'orc']) { UNIT_CACHE[f] = {}; for (const t in UNITS) UNIT_CACHE[f][t] = unitStat(t, f); }

const BUILDINGS = {
  hall:     { names: { human: 'Ayuntamiento', orc: 'Gran Salón' }, w: 4, h: 4, hp: 1200, gold: 500, wood: 300, time: 60, food: 6, key: 'H',
              sight: 7, desc: 'Entrena obreros y recibe oro y madera.' },
  farm:     { names: { human: 'Granja', orc: 'Porqueriza' }, w: 2, h: 2, hp: 400, gold: 80, wood: 40, time: 16, food: 5, key: 'G',
              sight: 3, desc: 'Alimento para 5 unidades más.' },
  barracks: { names: { human: 'Cuartel', orc: 'Barracas' }, w: 3, h: 3, hp: 800, gold: 250, wood: 150, time: 32, key: 'C',
              sight: 4, desc: 'Entrena el ejército.' },
  mill:     { names: { human: 'Aserradero', orc: 'Aserradero' }, w: 3, h: 3, hp: 600, gold: 150, wood: 100, time: 26, key: 'A',
              sight: 4, desc: 'Recibe madera. Permite arqueros y mejora proyectiles.' },
  smith:    { names: { human: 'Herrería', orc: 'Fragua' }, w: 3, h: 3, hp: 700, gold: 200, wood: 120, time: 28, key: 'F', needs: ['barracks'],
              sight: 4, desc: 'Mejora armas y armaduras.' },
  tower:    { names: { human: 'Torre de guardia', orc: 'Torre de vigía' }, w: 2, h: 2, hp: 500, gold: 160, wood: 90, time: 25, key: 'T', needs: ['mill'],
              sight: 9, dmg: 11, range: 6.5, cd: 1.2, desc: 'Defensa que dispara sola.' },
  stable:   { names: { human: 'Establo', orc: 'Foso de ogros' }, w: 3, h: 3, hp: 600, gold: 240, wood: 120, time: 30, key: 'E', needs: ['smith'],
              sight: 4, desc: 'Permite la unidad pesada.' },
  temple:   { names: { human: 'Iglesia', orc: 'Altar de sangre' }, w: 3, h: 3, hp: 600, gold: 220, wood: 120, time: 30, key: 'I', needs: ['barracks', 'mill'],
              sight: 4, desc: 'Entrena clérigos o chamanes.' },
  mine:     { names: { human: 'Mina de oro', orc: 'Mina de oro' }, w: 3, h: 3, hp: 100000, gold: 0, wood: 0, time: 0, sight: 0, desc: 'Mandá obreros a sacar oro.' },
};

const UPGRADES = {
  weapon: { name: 'Mejorar armas', at: 'smith', max: 2, gold: [200, 350], wood: [80, 150], time: [35, 45], key: 'W', desc: '+2 de daño cuerpo a cuerpo.' },
  armor:  { name: 'Mejorar armaduras', at: 'smith', max: 2, gold: [200, 350], wood: [80, 150], time: [35, 45], key: 'R', desc: '+2 de armadura para el ejército.' },
  arrow:  { name: 'Mejorar proyectiles', at: 'mill', max: 2, gold: [150, 300], wood: [150, 250], time: [32, 42], key: 'P', desc: '+2 de daño a arqueros y torres.' },
};

const BUILD_ORDER_MENU = ['farm', 'barracks', 'mill', 'smith', 'tower', 'stable', 'temple', 'hall'];
const GOLD_LOAD = 10, WOOD_LOAD = 10, TREE_WOOD = 60, MINE_TIME = 2.2, CHOP_TIME = 6, MAX_FOOD = 80;
