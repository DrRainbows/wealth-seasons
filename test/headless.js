/*
 * Headless sanity tests. Runs in Node by faking `window`.
 * Usage: node test/headless.js
 */
const fs = require('fs');
const path = require('path');

// Shim window
global.window = global;

// Load files in same order as index.html
const root = path.resolve(__dirname, '..');
const files = [
  'data/historical.js',
  'js/tax.js',
  'js/patterns.js',
  'js/events.js',
  'js/engine.js'
];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src).call(global);
}

const G = global.GAME;
if (!G || !G.engine) {
  console.error('Engine failed to load');
  process.exit(1);
}

// ---- Test 1: Tax engine sanity ----
console.log('--- Tax engine sanity ---');
const t = G.tax.calc({
  status: 'single', age: 35,
  wages: 100000, interest: 1000, qualDiv: 2000, ordDiv: 500,
  stcg: 0, ltcg: 5000, iraWithdraw: 0, rothConvert: 0, ssGross: 0,
  businessNet: 0, rentalNet: 0, hsaContrib: 4300,
  k401Contrib: 15000, tradIRAContrib: 0
});
console.log('Single, $100k W-2, $15k 401k, $5k LTCG → fed:', Math.round(t.fed),
            ' state:', Math.round(t.state), ' eff:', (t.effRate*100).toFixed(2)+'%');

const tRet = G.tax.calc({
  status: 'mfj', age: 70, ageSpouse: 68,
  wages: 0, interest: 5000, qualDiv: 8000, ltcg: 20000,
  iraWithdraw: 40000, rothConvert: 50000, ssGross: 36000,
  businessNet: 0, rentalNet: 12000, hsaContrib: 0, k401Contrib: 0, tradIRAContrib: 0
});
console.log('MFJ retired, $50k Roth conv, $36k SS, $40k IRA, $20k LTCG → fed:', Math.round(tRet.fed),
            ' ssTaxable:', Math.round(tRet.ssTaxableAmt), ' magi:', Math.round(tRet.magi));

// ---- Test 2: One full life on autopilot ----
console.log('\n--- Full life simulation: random historical, autopilot ---');
const state = G.engine.newGame({
  age: 22, wages: 60000, spendBase: 35000, status: 'single',
  historicalMode: 'random', state: 'AL', seed: 42
});
console.log('Historical start year:', state.opts.histStart);
let years = 0;
while (state.living && state.age < 95 && years < 80) {
  const d = G.engine.suggest(state);
  if (d.suggestedAlloc) d.changeStrategy = Object.assign({}, d.changeStrategy, { alloc: d.suggestedAlloc });
  // Deliberately save toward a rental down payment, buy at 30, then relax
  if (state.age === 25) d.changeStrategy = Object.assign({}, d.changeStrategy, { cashTargetMonths: 16 });
  if (state.age === 30){
    d.buyProperty = { price: 150000, downPct: 0.25 };
    d.changeStrategy = Object.assign({}, d.changeStrategy, { cashTargetMonths: 6 });
  }
  // Around 60, retire
  if (state.age === 62) d.retire = true;
  G.engine.tick(state, d);
  G.events.applyAll(state);
  years++;
}
const last = state.history[state.history.length - 1];
console.log('Years run:', years);
console.log('End age:', state.age, ' living:', state.living);
console.log('End NW:', Math.round(last.netWorth).toLocaleString(),
            ' real:', Math.round(last.netWorth / state.cpiFactor).toLocaleString());
console.log('Peak NW:', Math.round(Math.max(...state.history.map(h=>h.netWorth))).toLocaleString());
console.log('Cumulative taxes:', Math.round(state.cumulativeTaxes).toLocaleString());
console.log('Lifestyle absorbed:', Math.round(state.lifetimeLifestyle).toLocaleString());
console.log('Rental purchased:', state.properties.length === 1 ? 'yes' : 'NO — cash-target choreography failed');
console.log('SS claimed at:', state.ssClaimAge, ' benefit:', Math.round(state.ssAnnual).toLocaleString() + '/yr');
if (state.properties.length !== 1) process.exitCode = 1;
const totals = G.patterns.totals(state);
console.log('Pattern score: +', totals.plus, ' / -', totals.minus, ' = net', totals.net);
const top = G.patterns.topPatterns(state, 5);
console.log('Top activated:', top.activated.map(([id,v]) => `${id}×${v}`).join(', '));
console.log('Top violated:', top.violated.map(([id,v]) => `${id}×${v}`).join(', '));

// ---- Test 3: 100-year stochastic compounding sanity ----
console.log('\n--- Compounding sanity: $10k invested 100% S&P 1925-2024 (historical sequence) ---');
let v = 10000;
const sp = G.history.sp500;
for (let i = 0; i < sp.length; i++) v *= (1 + sp[i]);
console.log('$10k in 1928 → 2024:', Math.round(v).toLocaleString(),
            'CAGR:', (Math.pow(v/10000, 1/sp.length)*100 - 100).toFixed(2) + '%');

// ---- Test 4: RMD math ----
console.log('\n--- RMD test ---');
console.log('RMD age 75 divisor:', G.tax.rmdDivisor(75));
console.log('RMD on $1M trad IRA at 75:', Math.round(1000000 / G.tax.rmdDivisor(75)).toLocaleString());

// ---- Test 5: Multiple lives — distribution ----
console.log('\n--- 30 lives Monte Carlo (autopilot, 22-90, random historical) ---');
const results = [];
for (let s = 1; s <= 30; s++) {
  const g = G.engine.newGame({ age: 22, wages: 60000, spendBase: 35000, status: 'single',
                               historicalMode: 'random', seed: s });
  let yrs = 0;
  while (g.living && g.age < 90 && yrs < 70) {
    const d = G.engine.suggest(g);
    if (d.suggestedAlloc) d.changeStrategy = Object.assign({}, d.changeStrategy, { alloc: d.suggestedAlloc });
    if (g.age === 65) d.retire = true;
    G.engine.tick(g, d);
    yrs++;
    if (g.cashShortfall) break;
  }
  const finalNW = g.history.length ? g.history[g.history.length-1].netWorth : 0;
  results.push({ seed: s, hist: g.opts.histStart, nw: Math.round(finalNW),
                 realNW: Math.round(finalNW / g.cpiFactor),
                 patternNet: G.patterns.totals(g).net });
}
results.sort((a,b) => a.nw - b.nw);
console.log('Worst:', results[0]);
console.log('Median:', results[Math.floor(results.length/2)]);
console.log('Best:', results[results.length-1]);
const mean = results.reduce((s,r)=>s+r.nw,0) / results.length;
console.log('Mean NW at 90:', Math.round(mean).toLocaleString());

// ---- Test 6: Ghost world-sharing parity ----
// A companion sim driven by the player's recorded returns and replayed life
// events, running the identical policy, must produce the identical trajectory.
console.log('\n--- Ghost parity: same policy + shared world = identical trajectory ---');
{
  const mkOpts = { age: 22, wages: 60000, spendBase: 35000, status: 'single',
                   historicalMode: 'stochastic', seed: 1234 };
  const player = G.engine.newGame(mkOpts);
  const ghost = G.engine.newGame({ ...player.opts });
  ghost.isGhost = true;
  let maxDiff = 0;
  for (let i = 0; i < 55 && player.living; i++){
    const d = G.engine.suggest(player);
    if (d.suggestedAlloc) d.changeStrategy = { alloc: d.suggestedAlloc };
    if (player.age === 65) d.retire = true;
    G.engine.tick(player, d);
    G.events.applyAll(player);
    const log = player.history[player.history.length-1];

    const gd = G.engine.suggest(ghost);
    if (gd.suggestedAlloc) gd.changeStrategy = { alloc: gd.suggestedAlloc };
    if (ghost.age === 65) gd.retire = true;
    G.engine.tick(ghost, gd, log.returns);
    G.events.replay(ghost, log._events);

    const glog = ghost.history[ghost.history.length-1];
    maxDiff = Math.max(maxDiff, Math.abs(log.netWorth - glog.netWorth));
  }
  console.log('Max |player NW - ghost NW| across life:', maxDiff.toFixed(6));
  if (maxDiff > 0.01){
    console.error('FAIL: ghost diverged from player under identical policy/world');
    process.exitCode = 1;
  } else {
    console.log('PASS: ghost lives the identical world.');
  }
}

// ---- Test 7: suggested allocation weights sum to 1 ----
{
  let ok = true;
  for (const age of [22, 30, 45, 60, 75, 90]){
    const s = G.engine.newGame({ age, historicalMode: 'stochastic', seed: 7 });
    const d = G.engine.suggest(s);
    const a = d.suggestedAlloc;
    const sum = (a.stocks||0)+(a.bonds||0)+(a.cash||0)+(a.reit||0)+(a.metals||0);
    if (Math.abs(sum - 1) > 0.001){ ok = false; console.error(`FAIL: alloc sums to ${sum} at age ${age}`); }
  }
  console.log(ok ? '\nPASS: suggested allocations sum to 1 at all ages.' : '');
  if (!ok) process.exitCode = 1;
}

console.log('\nAll tests completed.');
