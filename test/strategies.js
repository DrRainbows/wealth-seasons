/*
 * Compare three decision policies across many seeded lives:
 *   pattern-adherent  — the pattern-language autopilot (suggest)
 *   mainstream        — published-average behavior (mainstreamSuggest:
 *                       Vanguard HAS 2025 7.7% deferral, TDF glide, SS at FRA)
 *   pattern-violator  — median-American-shaped anti-pattern: saves 5% into
 *                       taxable only, cash-heavy, panic-sells crashes and
 *                       re-risks after booms, never rebalances, retires and
 *                       claims SS at 62.
 * Aim: prove the patterns drive outcome through the arithmetic, not the score.
 * All allocation changes go through d.changeStrategy so they are REAL trades
 * (applied to accounts, taxed in taxable) — not just strategy-field edits.
 */
const fs = require('fs');
const path = require('path');
global.window = global;
const root = path.resolve(__dirname, '..');
for (const f of ['data/historical.js','js/tax.js','js/patterns.js','js/events.js','js/engine.js']){
  new Function(fs.readFileSync(path.join(root, f),'utf8')).call(global);
}
const G = global.GAME;

const YEARS = 68; // ages 22..90

function newLife(seed){
  return G.engine.newGame({ age: 22, wages: 60000, spendBase: 35000,
    status: 'single', historicalMode: 'random', seed });
}

function playPattern(seed){
  const s = newLife(seed);
  for (let i = 0; i < YEARS && s.living; i++){
    const d = G.engine.suggest(s);
    if (d.suggestedAlloc) d.changeStrategy = Object.assign({}, d.changeStrategy, { alloc: d.suggestedAlloc });
    if (s.age === 65) d.retire = true;
    G.engine.tick(s, d);
    G.events.applyAll(s);
  }
  return s;
}

function playMainstream(seed){
  const s = newLife(seed);
  for (let i = 0; i < YEARS && s.living; i++){
    const d = G.engine.mainstreamSuggest(s);
    if (d.suggestedAlloc) d.changeStrategy = Object.assign({}, d.changeStrategy, { alloc: d.suggestedAlloc });
    if (s.age === 65) d.retire = true;
    G.engine.tick(s, d);
    G.events.applyAll(s);
  }
  return s;
}

function playAnti(seed){
  const s = newLife(seed);
  for (let i = 0; i < YEARS && s.living; i++){
    const d = {};
    if (s.age === 22){
      d.changeStrategy = { alloc: { stocks: 0.4, bonds: 0.10, cash: 0.50, reit: 0, metals: 0 },
                           rebalanceAnnually: false };
    }
    // Saves only 5%, into taxable (no tax sheltering)
    if (!s.retired) d.taxable = Math.max(0, s.wages * 0.05);
    // Reacts to last year's market: sells out after crashes, re-risks after booms
    const last = s.history[s.history.length-1];
    if (last && last.marketReturn < -0.10){
      d.changeStrategy = { alloc: { stocks: 0.1, bonds: 0.2, cash: 0.7, reit: 0, metals: 0 } };
    } else if (last && last.marketReturn > 0.15){
      d.changeStrategy = { alloc: { stocks: 0.7, bonds: 0.1, cash: 0.2, reit: 0, metals: 0 } };
    }
    if (s.age === 62){ d.retire = true; d.claimSS = true; }
    G.engine.tick(s, d);
    G.events.applyAll(s);
  }
  return s;
}

console.log('Three policies, 40 seeded lives each (ages 22-90, random historical windows)');
console.log('-'.repeat(96));
const pa = [], ms = [], an = [];
for (let seed = 1; seed <= 40; seed++){
  pa.push(playPattern(seed));
  ms.push(playMainstream(seed));
  an.push(playAnti(seed));
}
function endNW(s){ return s.history.length ? s.history[s.history.length-1].netWorth : 0; }
function endRealNW(s){ return endNW(s) / (s.cpiFactor || 1); }
function summary(arr, label){
  const reals = arr.map(endRealNW).sort((a,b)=>a-b);
  const med = reals[Math.floor(reals.length/2)];
  const mean = reals.reduce((s,x)=>s+x,0)/reals.length;
  const taxAvg = arr.reduce((s,x)=>s+x.cumulativeTaxes,0)/arr.length;
  const lifeAvg = arr.reduce((s,x)=>s+(x.lifetimeLifestyle||0),0)/arr.length;
  const patternAvg = arr.reduce((s,x)=>s + G.patterns.totals(x).net, 0)/arr.length;
  const shortfalls = arr.filter(x => x.cashShortfall).length;
  console.log(`${label.padEnd(18)} real NW  median ${(med/1e6).toFixed(2)}M`
              + `  mean ${(mean/1e6).toFixed(2)}M`
              + `  min ${(reals[0]/1e6).toFixed(2)}M`
              + `  max ${(reals[reals.length-1]/1e6).toFixed(2)}M`
              + `  | tax ${(taxAvg/1e6).toFixed(1)}M`
              + `  lifestyle ${(lifeAvg/1e6).toFixed(1)}M`
              + `  patternNet ${patternAvg.toFixed(0)}`
              + `  depleted ${shortfalls}/40`);
  return { med, mean };
}
const sPa = summary(pa, 'pattern-adherent');
const sMs = summary(ms, 'mainstream');
const sAn = summary(an, 'pattern-violator');

const advDiscMain = sPa.med / Math.max(1, sMs.med);
const advDiscAnti = sPa.med / Math.max(1, sAn.med);
console.log('');
console.log(`Disciplined / Mainstream (median real) = ${advDiscMain.toFixed(2)}x   <- the reveal`);
console.log(`Disciplined / Violator   (median real) = ${advDiscAnti.toFixed(2)}x`);
console.log('Expectation: adherent ≥ 2x mainstream and ≥ 3x violator; mainstream > violator.');
let failed = false;
if (!(advDiscMain >= 2))   { console.error('FAIL: disciplined should be ≥2x mainstream'); failed = true; }
if (!(advDiscAnti >= 3))   { console.error('FAIL: disciplined should be ≥3x violator'); failed = true; }
if (!(sMs.med > sAn.med))  { console.error('FAIL: mainstream should beat violator'); failed = true; }
if (failed) process.exitCode = 1;
else console.log('PASS: pattern language materially outperforms through the arithmetic.');
