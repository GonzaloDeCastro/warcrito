// Prueba sin navegador: dos computadoras juegan entre sí.
//   node test/sim-test.js            (una partida por mapa)
//   node test/sim-test.js hard easy  (niveles de cada bando)
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['data.js', 'map.js', 'sim.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.Game = Game; this.AI = AI; this.MAPW = MAPW; this.MAPH = MAPH;', ctx);

const [lvA = 'normal', lvB = 'normal'] = process.argv.slice(2);
let failed = false;
for (const map of ['valle', 'rio', 'bosque']) {
  for (const seed of [7, 1234]) {
    const factions = seed === 7 ? ['human', 'orc'] : ['orc', 'human'];
    const g = new ctx.Game({ map, seed, factions });
    const ais = [new ctx.AI(g, 0, lvA), new ctx.AI(g, 1, lvB)];
    const dt = 1 / 30, started = Date.now();
    let ticks = 0;
    while (g.winner === null && g.time < 2400) {
      for (const a of ais) a.update(dt);
      g.tick(dt);
      g.events.length = 0;
      if (++ticks % 300 === 0) {
        // La grilla de ocupación debe coincidir siempre con las unidades
        const occ = new Uint8Array(ctx.MAPW * ctx.MAPH);
        for (const e of g.list) if (e.kind === 'unit' && !e.hidden) occ[e.y * ctx.MAPW + e.x]++;
        if (occ.some((v, i) => v !== g.occ[i])) { console.log('ERROR ocupación t=' + g.time.toFixed(0)); failed = true; break; }
        if (g.players.some(p => p.gold < 0 || p.wood < 0)) { console.log('ERROR recursos negativos'); failed = true; break; }
      }
    }
    const line = g.players.map(p => {
      const us = g.list.filter(e => e.owner === p.id && e.kind === 'unit').length;
      const bs = g.list.filter(e => e.owner === p.id && e.kind === 'building').length;
      return `${p.faction}: oro+${p.stats.gold} mad+${p.stats.wood} entr ${p.stats.trained} perd ${p.stats.lost} arras ${p.stats.razed} | ${us}u ${bs}e comida ${p.food}/${p.cap}`;
    });
    console.log(`${map} #${seed} t=${(g.time / 60).toFixed(1)}min gana=${g.winner === null ? '-' : factions[g.winner]} (${Date.now() - started} ms)`);
    for (const l of line) console.log('   ' + l);
  }
}
process.exit(failed ? 1 : 0);
