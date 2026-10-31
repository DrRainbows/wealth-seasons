/*
 * UI layer. Renders setup screen, year-by-year game, and final report.
 * Vanilla DOM + Canvas for chart.
 */
window.GAME = window.GAME || {};
GAME.ui = (function () {
  const E = GAME.engine, P = GAME.patterns, V = GAME.events, T = GAME.tax;
  let state = null;
  let chartCanvas = null;

  // ---- Helpers ----
  const $ = (s, root) => (root||document).querySelector(s);
  const $$ = (s, root) => Array.from((root||document).querySelectorAll(s));
  const fmt = (n) => {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n);
    if (v >= 1e9) return sign + '$' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return sign + '$' + (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return sign + '$' + (v/1e3).toFixed(1) + 'k';
    return sign + '$' + Math.round(v).toLocaleString();
  };
  const pct = (n) => (n*100).toFixed(1)+'%';

  // Scenarios are pre-set challenges with specific starting conditions and historical era
  const SCENARIOS = {
    'fresh-start': {
      label: 'Fresh start (open-ended)',
      desc: 'A recent grad in Alabama. Open-ended — make whatever life you can.',
      goals: 'Reach retirement age (≥65) with positive net worth. Sustain inflation-adjusted spending through age 90.',
      apply(o){ /* defaults */ }
    },
    'survive-1929': {
      label: 'Survive 1929',
      desc: 'Born 1907, age 22 in 1929 — you start investing the year of the Great Crash. Can you reach retirement?',
      goals: 'Hold equities through 1929-32 (≥80% loss). Reach retirement (65) with ≥$1M real. Net pattern score ≥ +200.',
      apply(o){ o.histStart = 1929; o.historicalMode = 'random'; }
    },
    'josephs-test': {
      label: "Joseph's Test (7 plenty, 7 famine)",
      desc: 'Stochastic mode with intentional cycle pressure. Build a reserve during plenty; deploy in famine.',
      goals: 'Maintain ≥1 yr of spending in reserve at all times after age 30. Buy-the-dip ≥2 times. Final NW ≥ $5M real.',
      apply(o){ o.historicalMode = 'stochastic'; }
    },
    'house-hacker': {
      label: 'House hacker (§121 cycle)',
      desc: 'Run the Serial Residence Harvester pattern. Buy/improve/sell primary home repeatedly for tax-free gains.',
      goals: '≥3 successful §121 sales by age 60. Live-in renovation expertise must be in your competence.',
      apply(o){ o.competence = ['stocks','real-estate']; }
    },
    'late-starter': {
      label: 'Late starter (age 45, $50k saved)',
      desc: 'You started late, with little. The compounding window is tight — every pattern matters more.',
      goals: 'Reach 65 with ≥$1M nominal. Sequence shield + Roth conversion ladder are your friends.',
      apply(o){ o.age = 45; o.wages = 95000; o.spendBase = 55000; }
    },
    'family-mfj': {
      label: 'Alabama family of four',
      desc: 'MFJ, two earners merged into one wage, two kids. Real estate + 529 (modeled as additional savings) common path.',
      goals: 'Funded curved retirement spending + leave ≥$2M legacy (real) for heirs.',
      apply(o){ o.status = 'mfj'; o.ageSpouse = 28; o.wages = 130000; o.spendBase = 65000; }
    },
    'fire-aspirant': {
      label: 'FIRE (retire at 50)',
      desc: 'Aggressive savings, retire by 50. Sustain 40+ years of curved spending without depleting.',
      goals: 'Retire at ≤50 with ≥$3M real. Maintain through age 90 without shortfall.',
      apply(o){ o.spendBase = 30000; }
    }
  };

  function buildSetup(){
    const html = `
    <section class="card setup">
      <h2>Wealth Seasons — choose how to begin</h2>
      <p class="muted">A lifetime investment game. Each year you make decisions and a real or simulated market unfolds. Patterns from 100+ years of evidence are scored as you play. Read <a href="manual.html" target="_blank">the manual</a> for full rules.</p>

      <div class="scenarios-row">
        <label class="scenario-label">Scenario:
          <select id="opt-scenario">
            ${Object.entries(SCENARIOS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
        </label>
        <div id="scenario-desc" class="scenario-desc"></div>
        <div id="scenario-goals" class="scenario-goals"></div>
      </div>

      <h3>Customize your starting position</h3>
      <div class="grid">
        <label>Starting age
          <input type="number" id="opt-age" value="22" min="18" max="70">
        </label>
        <label>Annual wages
          <input type="number" id="opt-wages" value="60000" min="0" step="1000">
        </label>
        <label>Real wage growth (above inflation)
          <input type="number" id="opt-wagegrow" value="1.0" step="0.5"> %
        </label>
        <label>Annual baseline spending
          <input type="number" id="opt-spend" value="35000" min="0" step="1000">
        </label>
        <label>Filing status
          <select id="opt-status">
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
          </select>
        </label>
        <label>State
          <select id="opt-state">
            <option value="AL">Alabama (no SS / retirement income tax)</option>
            <option value="CA">California (high tax)</option>
            <option value="TX">Texas / Florida / no income tax</option>
          </select>
        </label>
        <label>Market history mode
          <select id="opt-histmode">
            <option value="random">Random historical start (recommended)</option>
            <option value="sequential">Start at 2026 + forward</option>
            <option value="stochastic">Stochastic (Monte Carlo)</option>
          </select>
        </label>
        <label>Areas of competence
          <select id="opt-competence" multiple size="3">
            <option value="stocks" selected>Stocks / index funds</option>
            <option value="real-estate">Real estate</option>
            <option value="business">Small business / self-employment</option>
            <option value="farmland">Farmland</option>
          </select>
        </label>
        <label>Random seed (blank = random)
          <input type="text" id="opt-seed" placeholder="e.g. 12345">
        </label>
      </div>
      <div class="setup-actions">
        <button id="btn-start" class="primary">Start your investing life</button>
        <button id="btn-autopilot" class="ghost">Autopilot run (pattern-language defaults)</button>
      </div>
      <details class="patterns-intro">
        <summary>What patterns will the game evaluate?</summary>
        <ul>
          ${P.PATTERNS.map(p => `<li><strong>${p.name}</strong></li>`).join('')}
        </ul>
        <p class="muted">Each year, your decisions either reinforce or violate these patterns. Your final score reflects pattern adherence + actual financial outcome.</p>
      </details>
    </section>`;
    $('#screen').innerHTML = html;
    $('#btn-start').onclick = () => beginGame(false);
    $('#btn-autopilot').onclick = () => beginGame(true);
    const updateScenario = () => {
      const k = $('#opt-scenario').value;
      const sc = SCENARIOS[k];
      $('#scenario-desc').textContent = sc.desc;
      $('#scenario-goals').innerHTML = '<strong>Goals:</strong> ' + sc.goals;
    };
    $('#opt-scenario').onchange = updateScenario;
    updateScenario();
    GAME.hints && GAME.hints.attachAll();
  }

  function readSetup(){
    const competenceSel = $('#opt-competence');
    const competence = Array.from(competenceSel.selectedOptions).map(o => o.value);
    const seedVal = $('#opt-seed').value.trim();
    const opts = {
      age: +$('#opt-age').value,
      wages: +$('#opt-wages').value,
      wageGrowth: (+$('#opt-wagegrow').value)/100,
      spendBase: +$('#opt-spend').value,
      status: $('#opt-status').value,
      ageSpouse: $('#opt-status').value === 'mfj' ? +$('#opt-age').value : null,
      state: $('#opt-state').value,
      historicalMode: $('#opt-histmode').value,
      competence,
      yearStart: 2026,
      seed: seedVal ? +seedVal : undefined
    };
    const scenario = SCENARIOS[$('#opt-scenario').value];
    if (scenario && scenario.apply) scenario.apply(opts);
    opts.scenario = $('#opt-scenario').value;
    opts.scenarioMeta = scenario;
    return opts;
  }

  function beginGame(autopilot){
    state = E.newGame(readSetup());
    state.autopilot = !!autopilot;
    GAME.achievements.init(state);
    makeGhosts();
    buildGame();
    renderGame();
  }

  // Two companion lives created at birth from the same options. They tick
  // alongside the player through the identical world: same market year
  // (recorded returns), same life events (replayed), same lifespan. Only the
  // strategy differs. Both retire at 65 so retirement timing is not a
  // confound; SS claim age IS strategy (mainstream claims at FRA 67,
  // disciplined delays to 70).
  function makeGhosts(){
    function mk(policyFn, retireAge){
      const g = E.newGame({ ...state.opts });
      g.isGhost = true;
      g._policy = policyFn;
      g._retireAge = retireAge;
      GAME.achievements.init(g);
      return g;
    }
    state._ghosts = {
      mainstream:  mk(E.mainstreamSuggest, 65),
      disciplined: mk(E.suggest, 65)
    };
  }

  // Advance both ghosts through the year the player just lived.
  function tickGhosts(){
    if (!state._ghosts) return;
    const log = state.history[state.history.length-1];
    if (!log) return;
    for (const k of ['mainstream','disciplined']){
      const g = state._ghosts[k];
      if (!g || !g.living) continue;
      const gd = g._policy(g) || {};
      if (gd.suggestedAlloc){
        gd.changeStrategy = Object.assign({}, gd.changeStrategy, { alloc: gd.suggestedAlloc });
      }
      if (!g.retired && g.age >= g._retireAge) gd.retire = true;
      E.tick(g, gd, log.returns);
      V.replay(g, log._events);
      GAME.achievements.check(g);
    }
  }

  function buildGame(){
    $('#screen').innerHTML = `
    <section class="game-grid">
      <header class="status">
        <div class="status-cell"><label>Age</label><div id="s-age">--</div></div>
        <div class="status-cell"><label>Year</label><div id="s-year">--</div></div>
        <div class="status-cell"><label>Net worth</label><div id="s-nw">--</div></div>
        <div class="status-cell"><label>Real NW (today $)</label><div id="s-real-nw">--</div></div>
        <div class="status-cell"><label>Wages</label><div id="s-wages">--</div></div>
        <div class="status-cell"><label>Spending</label><div id="s-spend">--</div></div>
        <div class="status-cell"><label>Phase</label><div id="s-phase">--</div></div>
        <div class="status-cell stewardship"><label>Stewardship Score</label><div id="s-stewardship">0</div></div>
        <div class="status-cell"><label>Achievements</label><div id="s-ach">0 / ${GAME.achievements.ACHIEVEMENTS.length}</div></div>
      </header>
      <div id="scenario-bar" class="scenario-bar"></div>

      <div class="card chart-card">
        <div class="card-header">
          <strong>Wealth trajectory</strong>
          <span id="chart-sub" class="muted"></span>
        </div>
        <canvas id="chart" width="700" height="220"></canvas>
        <div class="three-legend">
          <span class="lg lg-you">— You</span>
          <span class="lg lg-disc">┅ Pattern-Disciplined</span>
          <span class="lg lg-main">┅ Mainstream</span>
        </div>
        <div id="market-event" class="event-bar"></div>
      </div>

      <aside class="card accounts-card">
        <div class="card-header"><strong>Accounts</strong></div>
        <table id="accounts-table"></table>
        <div id="real-assets"></div>
      </aside>

      <div class="card decisions-card">
        <div class="card-header"><strong>Decisions for the year</strong>
          <span id="decision-help" class="muted"></span>
        </div>
        <div id="decisions"></div>
      </div>

      <aside class="card patterns-card" id="patterns-card">
        <div class="card-header">
          <strong>Active pattern guidance</strong>
          <button id="btn-toggle-patterns" class="ghost mini" title="Collapse/expand the pattern guidance">−</button>
        </div>
        <ul id="patterns-list"></ul>
      </aside>

      <footer class="actions">
        <button id="btn-suggest" class="ghost">Use suggested defaults</button>
        <button id="btn-advance" class="primary">Advance 1 year ▶</button>
        <button id="btn-advance-5" class="ghost">Skip 5 yrs (auto)</button>
        <button id="btn-advance-to-65" class="ghost">Auto to 65</button>
        <button id="btn-retire" class="ghost">Retire now</button>
        <button id="btn-hints" class="ghost">Hints: off</button>
        <button id="btn-restart" class="ghost danger">Restart</button>
      </footer>

      <div id="messages" class="messages"></div>
    </section>`;
    chartCanvas = $('#chart');
    $('#btn-toggle-patterns').onclick = () => {
      const card = $('#patterns-card');
      card.classList.toggle('collapsed');
      $('#btn-toggle-patterns').textContent = card.classList.contains('collapsed') ? '+' : '−';
    };
    $('#btn-advance').onclick = () => advance(1, false);
    $('#btn-advance-5').onclick = () => advance(5, true);
    $('#btn-advance-to-65').onclick = () => {
      const yrs = Math.max(0, 65 - state.age);
      if (yrs > 0) advance(yrs, true);
    };
    $('#btn-restart').onclick = () => buildSetup();
    $('#btn-suggest').onclick = () => populateDecisionsWithSuggestion();
    $('#btn-retire').onclick = () => { state.retired = true; state.retiredAt = state.age; renderGame(); };
    $('#btn-hints').onclick = () => {
      const on = !GAME.hints.isOn();
      GAME.hints.setHints(on);
      $('#btn-hints').textContent = 'Hints: ' + (on ? 'on' : 'off');
    };
    // Scenario bar
    if (state.opts.scenarioMeta) {
      $('#scenario-bar').innerHTML =
        `<strong>${state.opts.scenarioMeta.label}</strong> — ` +
        `<span class="muted">${state.opts.scenarioMeta.goals}</span>`;
    }
  }

  function advance(n, useSuggested){
    for (let i = 0; i < n && state.living; i++){
      let d;
      if (useSuggested || state.autopilot){
        d = E.suggest(state);
        if (d.suggestedAlloc){
          d.changeStrategy = Object.assign({}, d.changeStrategy, { alloc: d.suggestedAlloc });
        }
      } else {
        d = readDecisions();
      }
      E.tick(state, d);
      V.applyAll(state);
      tickGhosts();
      GAME.achievements.check(state);
      const popped = GAME.achievements.popNew(state);
      // Single-step advance: fire modal for big milestones, toast for small.
      // Burst advance (>1 year at a time): suppress modals; show only toasts.
      popped.forEach(a => {
        if (a.big && n === 1) milestoneModal(a);
        else flash('🏆 ' + a.name + ' — ' + a.msg, 'achievement');
      });
      if (!state.living) break;
    }
    renderGame();
    if (!state.living) endGame();
  }

  function renderGame(){
    if (!state) return;
    $('#s-age').textContent = state.age;
    $('#s-year').textContent = state.year;
    const nw = E.netWorth(state);
    $('#s-nw').textContent = fmt(nw);
    // Real (start-year $) net worth, deflated by the sim's actual cumulative CPI
    const realNW = nw / (state.cpiFactor || 1);
    $('#s-real-nw').textContent = fmt(realNW);
    $('#s-wages').textContent = state.retired ? 'retired' : fmt(state.wages);
    $('#s-spend').textContent = fmt(state.spendBase);
    $('#s-phase').textContent = phaseLabel(state);
    // Stewardship Score live
    $('#s-stewardship').textContent = GAME.achievements.stewardshipScore(state);
    $('#s-ach').textContent = (state.achievements?.size || 0) + ' / ' + GAME.achievements.ACHIEVEMENTS.length;
    // Accounts
    const aTbl = $('#accounts-table');
    const accRows = [
      ['Cash / Emergency', state.accounts.cash.balance, 'cash'],
      ['Roth 401(k)', state.accounts.roth401k.balance, 'roth'],
      ['Roth IRA',    state.accounts.rothIRA.balance,  'roth'],
      ['Trad 401(k)', state.accounts.trad401k.balance, 'trad'],
      ['Trad IRA',    state.accounts.tradIRA.balance,  'trad'],
      ['HSA',         state.accounts.hsa.balance,      'hsa'],
      ['Taxable brokerage', state.accounts.taxable.balance, 'taxable']
    ];
    aTbl.innerHTML = '<tr><th>Account</th><th>Balance</th></tr>' +
      accRows.map(([n,v,c]) => `<tr class="acc-${c}"><td>${n}</td><td>${fmt(v)}</td></tr>`).join('');
    // Real assets
    const ra = $('#real-assets');
    let raHtml = '';
    if (state.primaryHome){
      const h = state.primaryHome;
      const yrsOwned = state.year - h.yearAcquired;
      raHtml += `<h4>Primary Home</h4><div>${fmt(h.value)} · mortgage ${fmt(h.mortgage)} · equity ${fmt(h.value-h.mortgage)} · ${yrsOwned}y owned</div>`;
    }
    if (state.secondaryHome){
      const h = state.secondaryHome;
      raHtml += `<h4>Secondary Home</h4><div>${fmt(h.value)} · mortgage ${fmt(h.mortgage)}</div>`;
    }
    if (state.properties.length){
      raHtml += '<h4>Investment Properties</h4><ul>' + state.properties.map(p =>
        `<li>${p.kind}: ${fmt(p.value)} (mortgage ${fmt(p.mortgage)}, equity ${fmt(p.value-p.mortgage)})</li>`).join('') + '</ul>';
    }
    if (state.farmland.length){
      raHtml += '<h4>Farmland</h4><ul>' + state.farmland.map(f =>
        `<li>${fmt(f.value)}</li>`).join('') + '</ul>';
    }
    if (state.business){
      raHtml += `<h4>Business</h4><div>${fmt(state.business.value)} (cash flow ${fmt(state.business.cashFlow)})</div>`;
    }
    if (state.reserveBucket > 0){
      raHtml += `<h4>Joseph Reserve (granary)</h4><div>${fmt(state.reserveBucket)}</div>`;
    }
    if (state.lifetimeCharity > 0){
      raHtml += `<h4>Lifetime giving</h4><div>${fmt(state.lifetimeCharity)}</div>`;
    }
    ra.innerHTML = raHtml;
    // Chart
    drawChart();
    // Market event of last year
    const last = state.history[state.history.length-1];
    const evt = $('#market-event');
    if (last){
      evt.innerHTML = `<span class="ret ${last.marketReturn>=0?'pos':'neg'}">S&P ${last.marketReturn>=0?'+':''}${(last.marketReturn*100).toFixed(1)}%</span>` +
                      ` &nbsp; inflation ${(last.infl*100).toFixed(1)}% ` +
                      (last.event ? ` &nbsp; <em>${last.event}</em>` : '');
    } else { evt.textContent = ''; }
    // Patterns
    const guid = P.guidance(state).filter(g => g.msg);
    const totals = P.totals(state);
    $('#patterns-list').innerHTML = guid.map(g =>
      `<li class="patt-${g.layer}"><strong>${g.name}</strong><div>${g.msg}</div></li>`).join('') +
      `<li class="patt-summary"><strong>Pattern score</strong><div>+${totals.plus} / -${totals.minus} = <em>${totals.net}</em></div></li>`;
    // Decision panel
    renderDecisions();
    renderMessages();
    // Re-attach hints (DOM was rebuilt)
    GAME.hints && GAME.hints.attachAll();
  }

  function phaseLabel(s){
    if (!s.retired){
      if (s.age < 32) return 'Early career';
      if (s.age < 50) return 'Mid career';
      if (s.age < 65) return 'Late career / pre-retire';
      return 'Working past 65';
    }
    if (s.age < 75) return 'Early retirement';
    if (s.age < 85) return 'Mid retirement';
    return 'Late retirement';
  }

  function renderDecisions(){
    const d = $('#decisions');
    const s = state;
    const k401limit = s.age >= 50 ? 31000 : 23500;
    const iraLimit = s.age >= 50 ? 8500 : 7500;
    const hsaLimit = 4300;
    const cash = Math.max(0, s.accounts.cash.balance);
    const suggestion = E.suggest(s);
    let html = '';
    if (!s.retired){
      html += `
      <div class="dec-section">
        <h4>Contributions <span class="muted">(401(k) limit ${fmt(k401limit)}, IRA limit ${fmt(iraLimit)}, HSA ${fmt(hsaLimit)})</span></h4>
        <div class="grid-2">
          <label>Roth 401(k) <input type="number" id="d-roth401k" value="${Math.round(suggestion.roth401k||0)}" min="0" step="500"></label>
          <label>Trad 401(k) <input type="number" id="d-trad401k" value="${Math.round(suggestion.trad401k||0)}" min="0" step="500"></label>
          <label>Roth IRA   <input type="number" id="d-rothIRA"  value="${Math.round(suggestion.rothIRA||0)}"  min="0" step="500"></label>
          <label>Trad IRA   <input type="number" id="d-tradIRA"  value="${Math.round(suggestion.tradIRA||0)}"  min="0" step="500"></label>
          <label>HSA        <input type="number" id="d-hsa"      value="${Math.round(suggestion.hsaContrib||0)}" min="0" step="100"></label>
          <label>Taxable    <input type="number" id="d-taxable"  value="${Math.round(suggestion.taxable||0)}"  min="0" step="500"></label>
        </div>
      </div>`;
    }
    html += `
    <div class="dec-section">
      <h4>Allocation <span class="muted">(stocks/bonds/cash/REIT/metals — must sum to 100%)</span></h4>
      <div class="grid-5">
        <label>Stocks <input type="number" id="a-stocks" value="${Math.round((s.strategy.alloc.stocks||0)*100)}" min="0" max="100" step="5">%</label>
        <label>Bonds  <input type="number" id="a-bonds"  value="${Math.round((s.strategy.alloc.bonds||0) *100)}" min="0" max="100" step="5">%</label>
        <label>Cash   <input type="number" id="a-cash"   value="${Math.round((s.strategy.alloc.cash||0)  *100)}" min="0" max="100" step="5">%</label>
        <label>REIT   <input type="number" id="a-reit"   value="${Math.round((s.strategy.alloc.reit||0)  *100)}" min="0" max="100" step="5">%</label>
        <label>Metals <input type="number" id="a-metals" value="${Math.round((s.strategy.alloc.metals||0)*100)}" min="0" max="100" step="5">%</label>
      </div>
    </div>`;

    html += `<div class="dec-section">
      <h4>Major moves</h4>
      ${!s.primaryHome ? `<button id="btn-buy-home" class="ghost">Buy primary home ($280k, 20% down)</button>` :
        `<button id="btn-improve-home" class="ghost">Remodel ($30k → +basis & value)</button>
         ${(s.year - s.primaryHome.yearAcquired >= 2) ? `<button id="btn-sell-home" class="ghost primary-action">Sell primary (§121 tax-free)</button>` : `<span class="muted">§121 eligible in ${2-(s.year-s.primaryHome.yearAcquired)}y</span>`}`}
      ${!s.secondaryHome ? `<button id="btn-buy-secondary" class="ghost">Buy vacation home ($350k)</button>` : ''}
      <button id="btn-buy-prop" class="ghost">Buy rental ($150k, 25% down)</button>
      <button id="btn-buy-str" class="ghost">Buy STR ($250k, 25% down)</button>
      <button id="btn-buy-farm" class="ghost">Buy farmland ($80k cash)</button>
      <button id="btn-start-biz" class="ghost">Start business ($50k)</button>
    </div>`;

    html += `<div class="dec-section">
      <h4>Stewardship & strategy</h4>
      <div class="grid-2">
        <label>Cash target <input type="number" id="d-cashtarget" value="${s.strategy.cashTargetMonths||6}" min="0" max="60" step="3"> months of spending</label>
        <label>Joseph reserve rate <input type="number" id="d-joseph" value="${Math.round((s.strategy.josephReserveRate||0)*100)}" min="0" max="25" step="5">% of cash</label>
        <label>Charitable giving <input type="number" id="d-charity" value="${s._charity||0}" min="0" step="500"> $ this year</label>
        ${s.age >= 70 ? `<label>QCD from IRA <input type="number" id="d-qcd" value="0" min="0" step="1000"></label>` : ''}
        <label><input type="checkbox" id="d-cycle" ${s.strategy.cycleRhythmDeploy?'checked':''}> Cycle Rhythm (deploy reserves into corrections)</label>
      </div>
    </div>`;

    if (s.retired){
      const rmdAge = T.rmdStartAge(s.birthYear);
      html += `<div class="dec-section">
        <h4>Retirement actions</h4>
        <label>Spending curve
          <select id="d-curve">
            <option value="flat"      ${s.strategy.spendingCurve==='flat'?'selected':''}>Flat (constant real)</option>
            <option value="smile"     ${s.strategy.spendingCurve==='smile'?'selected':''}>Smile (front-loaded, dip mid)</option>
            <option value="declining" ${s.strategy.spendingCurve==='declining'?'selected':''}>Declining 1%/yr</option>
          </select>
        </label>
        <label>Roth conversion this year
          <input type="number" id="d-rothconv" value="${suggestion.rothConvert||0}" min="0" step="1000">
        </label>
        ${!s.ssClaimed ?
          `<button id="btn-claim-ss" class="ghost">Claim Social Security now (age ${s.age})</button>` :
          `<div class="muted">Social Security claimed at age ${s.ssClaimAge} — $${Math.round(s.ssAnnual).toLocaleString()}/yr.</div>`}
        ${s.age >= rmdAge ? `<div class="muted">RMDs active (age ${s.age} ≥ ${rmdAge}).</div>` : ''}
      </div>`;
    }

    d.innerHTML = html;

    $('#btn-buy-home') && ($('#btn-buy-home').onclick = () => {
      _pendingMoves.push({ buyPrimary: { price: 280000, downPct: 0.20 } });
      flash('Will buy primary home on Advance.');
    });
    $('#btn-improve-home') && ($('#btn-improve-home').onclick = () => {
      _pendingMoves.push({ improvePrimary: { cost: 30000, valueMultiplier: 1.5 } });
      flash('Will remodel primary home on Advance.');
    });
    $('#btn-sell-home') && ($('#btn-sell-home').onclick = () => {
      _pendingMoves.push({ sellPrimary: true });
      flash('Will sell primary home on Advance (§121).');
    });
    $('#btn-buy-secondary') && ($('#btn-buy-secondary').onclick = () => {
      _pendingMoves.push({ buySecondary: { price: 350000, downPct: 0.25 } });
      flash('Will buy vacation home on Advance.');
    });
    $('#btn-buy-prop') && ($('#btn-buy-prop').onclick = () => {
      _pendingMoves.push({ buyProperty: { price: 150000, downPct: 0.25 } });
      flash('Will buy rental on Advance.');
    });
    $('#btn-buy-str') && ($('#btn-buy-str').onclick = () => {
      _pendingMoves.push({ buyProperty: { price: 250000, downPct: 0.25, isSTR: true } });
      flash('Will buy short-term rental on Advance.');
    });
    $('#btn-buy-farm') && ($('#btn-buy-farm').onclick = () => {
      _pendingMoves.push({ buyFarm: { price: 80000 } });
      flash('Will buy farmland on Advance.');
    });
    $('#btn-start-biz') && ($('#btn-start-biz').onclick = () => {
      _pendingMoves.push({ startBusiness: { investment: 50000 } });
      flash('Will start business on Advance.');
    });
    $('#btn-claim-ss') && ($('#btn-claim-ss').onclick = () => {
      _pendingMoves.push({ claimSS: true });
      flash('Will claim Social Security on Advance.');
    });
  }

  let _pendingMoves = [];

  function flash(msg, kind){
    const m = document.createElement('div');
    m.className = 'toast ' + (kind || '');
    m.textContent = msg;
    document.body.appendChild(m);
    setTimeout(()=>m.remove(), kind === 'achievement' ? 4500 : 2200);
  }

  function milestoneModal(a){
    const modal = document.createElement('div');
    modal.className = 'milestone-modal';
    modal.innerHTML = `
      <div class="milestone-card">
        <div class="milestone-title">🏆 ${a.name}</div>
        <div class="milestone-msg">${a.msg}</div>
        <button class="primary">Continue</button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('button').onclick = () => modal.remove();
  }

  function readDecisions(){
    const s = state;
    const d = {};
    if (!s.retired){
      d.roth401k = +($('#d-roth401k')||{value:0}).value || 0;
      d.trad401k = +($('#d-trad401k')||{value:0}).value || 0;
      d.rothIRA  = +($('#d-rothIRA') ||{value:0}).value || 0;
      d.tradIRA  = +($('#d-tradIRA') ||{value:0}).value || 0;
      d.hsaContrib = +($('#d-hsa')||{value:0}).value || 0;
      d.taxable  = +($('#d-taxable')||{value:0}).value || 0;
    }
    const a = {
      stocks: (+$('#a-stocks').value||0)/100,
      bonds:  (+$('#a-bonds').value||0)/100,
      cash:   (+$('#a-cash').value||0)/100,
      reit:   (+$('#a-reit').value||0)/100,
      metals: (+$('#a-metals').value||0)/100
    };
    const sum = a.stocks + a.bonds + a.cash + a.reit + a.metals;
    if (sum > 0 && Math.abs(sum-1) > 0.02){
      for (const k in a) a[k] = a[k]/sum;
    }
    // Only record a strategy change if the allocation actually shifted.
    // The change is a decision, applied (and taxed as a trade) inside tick —
    // never pre-mutated here, so panic-selling is visible to the scorer.
    const prior = s.strategy.alloc;
    const shifted = Math.abs((prior.stocks||0)-a.stocks) > 0.005
                 || Math.abs((prior.bonds||0) -a.bonds)  > 0.005
                 || Math.abs((prior.cash||0)  -a.cash)   > 0.005
                 || Math.abs((prior.reit||0) -a.reit)    > 0.005
                 || Math.abs((prior.metals||0)-a.metals) > 0.005;
    if (shifted) d.changeStrategy = { alloc: a };
    // Stewardship & strategy controls
    if ($('#d-cashtarget')) s.strategy.cashTargetMonths = Math.max(0, +$('#d-cashtarget').value || 0);
    if ($('#d-joseph'))   s.strategy.josephReserveRate = (+$('#d-joseph').value||0)/100;
    if ($('#d-cycle'))    s.strategy.cycleRhythmDeploy = !!$('#d-cycle').checked;
    if ($('#d-charity'))  d.charitable = +$('#d-charity').value || 0;
    if ($('#d-qcd'))      d.qcd       = +$('#d-qcd').value || 0;
    if (s.retired){
      const curve = ($('#d-curve')||{value:'flat'}).value;
      s.strategy.spendingCurve = curve;
      d.rothConvert = +($('#d-rothconv')||{value:0}).value || 0;
    }
    // Apply any pending major moves
    for (const m of _pendingMoves) Object.assign(d, m);
    _pendingMoves = [];
    return d;
  }

  function populateDecisionsWithSuggestion(){
    const sug = E.suggest(state);
    if ($('#d-roth401k')) $('#d-roth401k').value = Math.round(sug.roth401k||0);
    if ($('#d-trad401k')) $('#d-trad401k').value = Math.round(sug.trad401k||0);
    if ($('#d-rothIRA'))  $('#d-rothIRA').value  = Math.round(sug.rothIRA||0);
    if ($('#d-tradIRA'))  $('#d-tradIRA').value  = Math.round(sug.tradIRA||0);
    if ($('#d-hsa'))      $('#d-hsa').value      = Math.round(sug.hsaContrib||0);
    if ($('#d-taxable'))  $('#d-taxable').value  = Math.round(sug.taxable||0);
    // Suggested glide-path allocation (falls back to current strategy)
    const al = sug.suggestedAlloc || state.strategy.alloc;
    if ($('#a-stocks'))   $('#a-stocks').value = Math.round((al.stocks||0)*100);
    if ($('#a-bonds'))    $('#a-bonds').value  = Math.round((al.bonds||0)*100);
    if ($('#a-cash'))     $('#a-cash').value   = Math.round((al.cash||0)*100);
    if ($('#a-reit'))     $('#a-reit').value   = Math.round((al.reit||0)*100);
    if ($('#a-metals'))   $('#a-metals').value = Math.round((al.metals||0)*100);
  }

  function renderMessages(){
    const m = $('#messages');
    if (!m) return;
    const recent = state.messages.slice(-8).reverse();
    m.innerHTML = recent.map(x => `<div class="msg msg-${x.level}">[${x.year}] ${x.msg}</div>`).join('');
  }

  function drawChart(){
    const ctx = chartCanvas.getContext('2d');
    const W = chartCanvas.width, H = chartCanvas.height;
    ctx.clearRect(0,0,W,H);
    if (state.history.length < 2){
      ctx.fillStyle = '#888'; ctx.font = '13px sans-serif';
      ctx.fillText('Wealth trajectory will appear here as years advance...', 20, H/2);
      return;
    }
    const data = state.history.map(h => h.netWorth);
    const ghostSeries = {};
    if (state._ghosts){
      for (const k of ['mainstream','disciplined']){
        const g = state._ghosts[k];
        if (g && g.history.length) ghostSeries[k] = g.history.map(h => h.netWorth);
      }
    }
    const allVals = data.concat(ghostSeries.mainstream || [], ghostSeries.disciplined || []);
    const minV = Math.min(0, ...allVals);
    const maxV = Math.max(...allVals, 1);
    const padL = 60, padR = 10, padT = 10, padB = 24;
    function xpos(i){ return padL + (W-padL-padR) * (i/(data.length-1 || 1)); }
    function ypos(v){ return H-padB - (H-padT-padB) * ((v-minV)/(maxV-minV || 1)); }
    // grid
    ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++){
      const y = padT + (H-padT-padB)*(i/5);
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
      const v = maxV - (maxV-minV)*(i/5);
      ctx.fillStyle = '#7a8395'; ctx.font = '11px sans-serif';
      ctx.fillText(fmt(v), 4, y+3);
    }
    // Ghost trajectories first (underneath), player line on top
    ['mainstream','disciplined'].forEach(k => {
      const t = ghostSeries[k];
      if (!t || !t.length) return;
      ctx.strokeStyle = k === 'mainstream' ? '#e2475a' : '#66a3ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash(k === 'mainstream' ? [6,4] : [3,3]);
      ctx.beginPath();
      t.forEach((v,i) => {
        if (i >= data.length) return;
        const x = xpos(i), y = ypos(v);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // player line
    ctx.strokeStyle = '#5dd28a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((v,i) => {
      const x = xpos(i), y = ypos(v);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    // mark crashes
    state.history.forEach((h,i) => {
      if (h.marketReturn < -0.15){
        ctx.fillStyle = '#e2475a';
        ctx.beginPath();
        ctx.arc(xpos(i), ypos(h.netWorth), 3.5, 0, Math.PI*2);
        ctx.fill();
      }
    });
    // x-axis labels
    ctx.fillStyle = '#7a8395'; ctx.font = '11px sans-serif';
    const showAt = [0, Math.floor(data.length/3), Math.floor(2*data.length/3), data.length-1];
    showAt.forEach(i => {
      const h = state.history[i];
      if (!h) return;
      ctx.fillText(`age ${h.age}`, xpos(i)-12, H-6);
    });
    // sub-caption
    const start = state.history[0], end = state.history.at(-1);
    const tot = end.netWorth, yrs = state.history.length;
    const cagr = (tot > 0 && start.netWorth > 0)
      ? (Math.pow(tot/Math.max(start.netWorth,1), 1/yrs) - 1) : null;
    $('#chart-sub').textContent =
      `${yrs} years simulated · ${state.opts.historicalMode === 'random'
        ? `historical start ${state.opts.histStart}` : state.opts.historicalMode}`
      + (cagr ? ` · approx ${pct(cagr)} CAGR` : '');
  }

  function endGame(){
    const totals = P.totals(state);
    const top = P.topPatterns(state, 6);
    const nw = E.netWorth(state);
    const yrs = state.history.length;
    const totalTaxesPaid = state.cumulativeTaxes;
    const peak = Math.max(...state.history.map(h=>h.netWorth));
    const drawdowns = computeDrawdowns(state.history.map(h=>h.netWorth));
    const archetype = classifyArchetype(state);
    const stewardship = GAME.achievements.stewardshipScore(state);
    const unlocked = state.achievements ? Array.from(state.achievements) : [];
    const real = v => v / (state.cpiFactor || 1);
    // The two companion lives that ticked alongside the player from year one:
    // identical market, identical life events, identical lifespan.
    const gM = state._ghosts && state._ghosts.mainstream;
    const gD = state._ghosts && state._ghosts.disciplined;
    function summarize(g){
      if (!g || !g.history.length) return { nw: 0, trajectory: [], stewardship: 0, lifestyle: 0, taxes: 0 };
      return {
        nw: g.history[g.history.length-1].netWorth,
        trajectory: g.history.map(h => h.netWorth),
        stewardship: GAME.achievements.stewardshipScore(g),
        lifestyle: g.lifetimeLifestyle || 0,
        taxes: g.cumulativeTaxes || 0
      };
    }
    const ghostMainstream = summarize(gM);
    const ghostDisciplined = summarize(gD);
    // Defer chart draw until DOM has rendered
    setTimeout(() => drawComparisonChart(
      state.history.map(h => h.netWorth),
      ghostDisciplined.trajectory,
      ghostMainstream.trajectory,
      state.history.map(h => h.age)), 0);
    const beatDisciplined = nw > ghostDisciplined.nw;
    const beatMainstream  = nw > ghostMainstream.nw;
    const disciplinedVsMainstream = ghostDisciplined.nw - ghostMainstream.nw;
    const html = `
    <section class="card final">
      <h2>Life summary, ${state.opts.yearStart}–${state.year-1}</h2>
      <div class="grid-3">
        <div><label>Final net worth</label><div class="big">${fmt(nw)}</div></div>
        <div><label>Real (start-year $)</label><div class="big">${fmt(real(nw))}</div></div>
        <div><label>Stewardship Score</label><div class="big">${stewardship}</div></div>
        <div><label>Peak net worth</label><div>${fmt(peak)}</div></div>
        <div><label>Cumulative taxes</label><div>${fmt(totalTaxesPaid)}</div></div>
        <div><label>Lifestyle absorbed</label><div>${fmt(state.lifetimeLifestyle||0)}</div></div>
        <div><label>Max drawdown</label><div>${(drawdowns.maxDD*100).toFixed(1)}%</div></div>
        <div><label>Pattern score</label><div>+${totals.plus} / -${totals.minus} = <strong>${totals.net}</strong></div></div>
        <div><label>Archetype</label><div><strong>${archetype.name}</strong></div></div>
      </div>
      <p class="archetype-desc">${archetype.desc}</p>
      <h3>Wealth over time — three strategies, identical life</h3>
      <canvas id="three-chart" width="1000" height="260"></canvas>
      <div class="three-legend">
        <span class="lg lg-main">— Mainstream</span>
        <span class="lg lg-disc">— Pattern-Disciplined</span>
        <span class="lg lg-you">— You</span>
      </div>
      <h3>Three lives, one world</h3>
      <p class="muted small">All three lived the identical world: same market years, same promotions and layoffs, same family and health events, same lifespan. Only the financial strategy differed. The Mainstream baseline follows published averages — Vanguard <em>How America Saves 2025</em> (7.7% deferral), Vanguard target-date glide path, Social Security at FRA (67). Pattern-Disciplined runs the pattern-language autopilot. You are you.</p>
      <div class="three-ghosts">
        <div class="ghost-col mainstream">
          <div class="ghost-label">Mainstream Autopilot</div>
          <div class="ghost-source">Vanguard TDF · 7.7% deferral · SS at 67</div>
          <div class="ghost-nw">${fmt(ghostMainstream.nw)}</div>
          <div class="ghost-detail">Real: ${fmt(real(ghostMainstream.nw))}</div>
          <div class="ghost-detail">Lifestyle absorbed: ${fmt(ghostMainstream.lifestyle)}</div>
          <div class="ghost-detail">Taxes: ${fmt(ghostMainstream.taxes)}</div>
          <div class="ghost-detail">Score: ${ghostMainstream.stewardship}</div>
        </div>
        <div class="ghost-col disciplined">
          <div class="ghost-label">Pattern-Disciplined</div>
          <div class="ghost-source">Full pattern language autopilot</div>
          <div class="ghost-nw">${fmt(ghostDisciplined.nw)}</div>
          <div class="ghost-detail">Real: ${fmt(real(ghostDisciplined.nw))}</div>
          <div class="ghost-detail">Lifestyle absorbed: ${fmt(ghostDisciplined.lifestyle)}</div>
          <div class="ghost-detail">Taxes: ${fmt(ghostDisciplined.taxes)}</div>
          <div class="ghost-detail">Score: ${ghostDisciplined.stewardship}</div>
        </div>
        <div class="ghost-col player ${beatDisciplined?'won':'lost'}">
          <div class="ghost-label">You</div>
          <div class="ghost-source">Your decisions</div>
          <div class="ghost-nw">${fmt(nw)}</div>
          <div class="ghost-detail">Real: ${fmt(real(nw))}</div>
          <div class="ghost-detail">Lifestyle absorbed: ${fmt(state.lifetimeLifestyle||0)}</div>
          <div class="ghost-detail">Taxes: ${fmt(totalTaxesPaid)}</div>
          <div class="ghost-detail">Score: ${stewardship}</div>
        </div>
      </div>
      <div class="ghost-readout">
        <div class="readout-line">
          <strong>The mainstream gap:</strong> in the same life, Pattern-Disciplined ended with
          <strong>${fmt(disciplinedVsMainstream)}</strong> more than the Mainstream baseline
          (${(ghostDisciplined.nw / Math.max(1,ghostMainstream.nw)).toFixed(1)}× the wealth).
        </div>
        <div class="readout-line ${beatDisciplined?'won':'neutral'}">
          <strong>You vs Pattern-Disciplined:</strong> ${beatDisciplined ? 'you beat' : 'you trailed'} the disciplined ghost by ${fmt(Math.abs(nw - ghostDisciplined.nw))}.
        </div>
        <div class="readout-line ${beatMainstream?'won':'lost'}">
          <strong>You vs Mainstream:</strong> ${beatMainstream ? 'you beat' : 'you trailed'} the mainstream baseline by ${fmt(Math.abs(nw - ghostMainstream.nw))}
          (${(nw / Math.max(1,ghostMainstream.nw)).toFixed(1)}× their wealth).
        </div>
      </div>
      <h3>Achievements unlocked (${unlocked.length} / ${GAME.achievements.ACHIEVEMENTS.length})</h3>
      <div class="ach-grid">
        ${GAME.achievements.list(state).map(a => `
          <div class="ach-item ${a.unlocked ? 'on' : 'off'}" title="${a.msg.replace(/"/g,'&quot;')}">
            ${a.unlocked ? '🏆' : '🔒'} ${a.name}
          </div>`).join('')}
      </div>
      <h3>Most reinforced patterns</h3>
      <ul>${top.activated.map(([id,v]) => {
        const info = P.info(id);
        return `<li><strong>${info.name}</strong> &nbsp; ×${v}</li>`;
      }).join('')}</ul>
      <h3>Most violated patterns</h3>
      <ul>${top.violated.length ? top.violated.map(([id,v]) => {
        const info = P.info(id);
        return `<li><strong>${info.name}</strong> &nbsp; ×${v}</li>`;
      }).join('') : '<li class="muted">None — you stayed disciplined.</li>'}</ul>
      <h3>Decade-by-decade</h3>
      <table class="decades">
        <tr><th>Decade</th><th>Wages avg</th><th>Spending avg</th><th>Lifestyle absorbed</th><th>NW end</th><th>Taxes</th></tr>
        ${decadeSummary(state)}
      </table>
      <button class="primary" onclick="GAME.ui.start()">Play another life</button>
    </section>`;
    $('#screen').innerHTML = html;
  }

  // Draws all three trajectories on the end-game canvas
  function drawComparisonChart(player, disc, main, ages){
    const c = document.getElementById('three-chart');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0,0,W,H);
    const all = [...player, ...disc, ...main, 0];
    const maxV = Math.max(...all);
    const minV = Math.min(0, ...all);
    const padL = 70, padR = 14, padT = 12, padB = 28;
    const n = Math.max(player.length, disc.length, main.length);
    const xpos = i => padL + (W-padL-padR) * (i / Math.max(1, n-1));
    const ypos = v => H-padB - (H-padT-padB) * ((v-minV) / Math.max(1, maxV-minV));
    // grid
    ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++){
      const y = padT + (H-padT-padB)*(i/5);
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
      const v = maxV - (maxV-minV)*(i/5);
      ctx.fillStyle = '#7a8395'; ctx.font = '11px sans-serif';
      ctx.fillText(fmt(v), 6, y+3);
    }
    function drawSeries(arr, color, width, dash){
      if (!arr || !arr.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
      ctx.beginPath();
      arr.forEach((v,i) => {
        const x = xpos(i), y = ypos(v);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawSeries(main,  '#e2475a', 2,   [6,4]);  // Mainstream (red dashed)
    drawSeries(disc,  '#66a3ff', 2,   [3,3]);  // Disciplined (blue dotted)
    drawSeries(player,'#5dd28a', 2.6, null);   // You (solid green)
    // x-axis age labels
    ctx.fillStyle = '#7a8395'; ctx.font = '11px sans-serif';
    [0, Math.floor(n/4), Math.floor(n/2), Math.floor(3*n/4), n-1].forEach(i => {
      if (ages[i] != null) ctx.fillText('age '+ages[i], xpos(i)-12, H-8);
    });
  }

  function computeDrawdowns(arr){
    let peak = arr[0]||0, maxDD = 0;
    for (const v of arr){
      if (v > peak) peak = v;
      else if (peak > 0) maxDD = Math.max(maxDD, (peak-v)/peak);
    }
    return { maxDD };
  }
  function classifyArchetype(state){
    const a = state.strategy.alloc;
    const props = state.properties.length + state.farmland.length;
    const totals = P.totals(state);
    if (props >= 2 && (a.stocks||0) < 0.6) return { name: 'Real-Asset Operator',
      desc: 'You built tangible income engines with conservative leverage. Inflation hedged, hands-on returns.' };
    if (state.business) return { name: 'Owner-Operator',
      desc: 'You concentrated equity in a business of your own. High-variance path; succeed and the multiples are spectacular.' };
    if ((a.stocks||0) > 0.7 && props === 0) return { name: 'Boglehead Indexer',
      desc: 'Broad equity ownership and disciplined holding. The historically reliable path for most.' };
    if (totals.net >= 15) return { name: 'Pattern-Disciplined Compounder',
      desc: 'You activated many of the same patterns that powered Buffett, Bogle, and Lynch followers.' };
    if (totals.net < 0) return { name: 'Behavioral Investor',
      desc: 'Emotion and timing pulled you off-pattern. The dollars usually follow.' };
    return { name: 'Balanced Diversifier',
      desc: 'A composite portfolio across paper and real assets. Resilient through cycles.' };
  }
  function decadeSummary(state){
    const decades = {};
    for (const h of state.history){
      const d = Math.floor(h.age/10)*10;
      if (!decades[d]) decades[d] = { wages: [], spend: [], nw: 0, tax: 0, life: 0 };
      decades[d].wages.push(h.wages);
      decades[d].spend.push(h.spendTarget || 0);
      decades[d].nw = h.netWorth;
      decades[d].tax += h.tax;
      decades[d].life += h.lifestyle || 0;
    }
    return Object.entries(decades).sort((a,b)=>+a[0]-+b[0]).map(([d,v]) => {
      const avgW = v.wages.reduce((s,x)=>s+x,0)/v.wages.length;
      const avgS = v.spend.reduce((s,x)=>s+x,0)/v.spend.length;
      return `<tr><td>Age ${d}s</td><td>${fmt(avgW)}</td><td>${fmt(avgS)}</td><td>${fmt(v.life)}</td><td>${fmt(v.nw)}</td><td>${fmt(v.tax)}</td></tr>`;
    }).join('');
  }

  return {
    start: buildSetup,
    state: () => state
  };
})();
