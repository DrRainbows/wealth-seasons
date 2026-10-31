/*
 * Core game engine. One tick = one year.
 *
 * Accounts:
 *  - roth401k, rothIRA  : tax-free withdrawals after 59.5 (assumed); no RMDs
 *  - trad401k, tradIRA  : pre-tax growth; withdrawals ordinary; RMDs at start age
 *  - taxable            : tracks cost basis for LTCG; qualified dividends each year
 *  - hsa                : pre-tax in/out for medical; otherwise treated as IRA-like
 *  - properties[]       : long-term rentals or short-term; carries mortgage, basis, depreciation
 *  - farmland[]         : like rental but lower vol, leased cash rent
 *  - business           : single small business equity (Schedule C / S-Corp)
 *
 * Allocation in liquid accounts is by sleeve weight (stocks/bonds/cash/REIT).
 * REIT distributions are taxed as ordinary (in taxable). Bonds also ordinary.
 *
 * Returns for sleeves come from GAME.history (historical mode) or stochastic.
 */
window.GAME = window.GAME || {};
GAME.engine = (function () {
  const H = GAME.history;
  const T = GAME.tax;

  // ---- defaults ----
  const DEFAULTS = {
    status: 'single',
    age: 22,
    ageSpouse: null,
    wages: 60000,
    wageGrowth: 0.01,       // REAL growth above CPI. SSA Average Wage Index real growth ~1%/yr long-run.
    spendBase: 35000,       // base annual spending (after-tax)
    state: 'AL',
    riskTolerance: 'moderate',
    competence: ['stocks'], // list of areas where player has expertise
    yearStart: 2026,
    historicalMode: 'random', // 'random' | 'sequential' | 'stochastic'
    histStart: null
  };

  // Default allocation by life stage (player can override). 'metals' is precious-metals sleeve.
  const DEFAULT_ALLOC = { stocks: 0.80, bonds: 0.10, cash: 0.05, reit: 0.00, metals: 0.05 };

  // Cap rate for synthetic property pricing
  const PROPERTY_CAP = 0.065;

  // Lifestyle absorption: fraction of UNASSIGNED cash above the cash target that
  // gets consumed each working year. Money given no assignment drifts into
  // spending; money deliberately allocated (contributions, reserves, purchases)
  // is never touched. Calibrated so a household that makes no deliberate saving
  // decisions nets roughly the U.S. personal saving rate (BEA: ~4-5% of
  // disposable income, 2024-25), while a 7.7% deferrer (Vanguard How America
  // Saves 2025 average) keeps what they deferred.
  const LIFESTYLE_ABSORPTION = 0.5;

  // Social Security taxable wage base (2026 est.) — caps earnings credited toward AIME.
  const SS_WAGE_BASE = 176100;

  // Sleeves dictionary (return components per year)
  function drawReturns(state, year){
    const h = H;
    let s,b,t,c,hh,f;
    let g;
    if (state.opts.historicalMode === 'stochastic' || year > 2024){
      // Stochastic: normal-ish using long-term mean/std.
      // Drawn from the dedicated market stream so decision paths (business,
      // mortality, events) never shift the market a companion sim would see.
      const mr = state.marketRng || state.rng;
      s = mr.normal(0.10, 0.18);
      b = mr.normal(0.045, 0.075);
      t = mr.normal(0.033, 0.025);
      c = mr.normal(0.030, 0.015);
      hh = mr.normal(0.044, 0.045);
      f = mr.normal(0.078, 0.060);
      g = mr.normal(0.055, 0.20);
    } else {
      s = h.get('sp500', year);
      b = h.get('t10', year);
      t = h.get('tbill', year);
      c = h.get('cpi', year);
      hh = h.get('housing', year);
      f = h.get('farm', year);
      g = h.get('gold', year);
    }
    return { stocks:s, bonds:b, tbill:t, cpi:c, housing:hh, farm:f, gold:g,
             metals: g, // alias
             reit: s*0.7 + hh*0.5,
             event: h.events[year] || null };
  }

  // Apply sleeve allocation to a balance to produce return %
  function sleeveReturn(alloc, r){
    return (alloc.stocks||0) * r.stocks
         + (alloc.bonds||0)  * r.bonds
         + (alloc.cash||0)   * r.tbill
         + (alloc.reit||0)   * r.reit
         + (alloc.metals||0) * r.gold;
  }

  // Seeded RNG (mulberry32) — high-quality uniform output for any seed
  function rng(seed){
    let s = ((seed != null ? seed : Date.now()) >>> 0) || 1;
    function next(){
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal(mean, std){
      const u = 1 - next(), v = 1 - next();
      return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    // Warm up
    for (let i = 0; i < 4; i++) next();
    return { next, normal };
  }

  // ---- Account types ----
  function blankAccount(name, taxType){
    return { name, taxType, balance: 0, basis: 0, alloc: { ...DEFAULT_ALLOC } };
  }

  function blankProperty(price, downPct, rate, term, capRate, isSTR){
    const loan = price * (1 - downPct);
    return {
      kind: isSTR ? 'STR' : 'LTR',
      price, value: price, basis: price,
      mortgage: loan, rate, termYears: term,
      monthlyPI: amortPI(loan, rate, term),
      capRate,
      depPrior: 0,           // depreciation taken to date
      depSchedule: price * 0.85 / 27.5, // 27.5-yr SL, 85% improvements
      yearAcquired: 0,
      isSTR: !!isSTR
    };
  }
  function amortPI(loan, rate, years){
    if (loan <= 0) return 0;
    const r = rate/12, n = years*12;
    return loan * r / (1 - Math.pow(1+r, -n));
  }

  // ---- Game state ----
  function newGame(userOpts){
    const opts = Object.assign({}, DEFAULTS, userOpts || {});
    const seed = (opts.seed != null) ? opts.seed : Math.floor(Math.random()*1e9);
    // Independent streams per concern: market draws and life randomness must not
    // consume from each other, or two sims with the same seed but different
    // decisions would see different worlds.
    const lifeRng = rng(seed + 1013904223);
    const state = {
      opts,
      seed,
      rng: lifeRng,             // life events, business shocks, mortality
      lifeRng,
      marketRng: rng(seed),     // stochastic market returns only
      year: opts.yearStart,
      age: opts.age,
      ageSpouse: opts.ageSpouse,
      living: true,
      retired: false,
      ssClaimed: false,
      ssClaimAge: null,
      ssBaseBenefit: null,    // computed at claim
      ssAnnual: 0,
      careerYears: 0,
      wages: opts.wages,
      spendBase: opts.spendBase,
      cumulativeTaxes: 0,
      patternScore: { activated: {}, violated: {} },
      history: [],
      decisions: [],
      messages: [],
      // Accounts
      accounts: {
        roth401k:  blankAccount('Roth 401(k)', 'rothQual'),
        rothIRA:   blankAccount('Roth IRA',     'rothQual'),
        trad401k:  blankAccount('Trad 401(k)',  'tradPretax'),
        tradIRA:   blankAccount('Trad IRA',     'tradPretax'),
        taxable:   blankAccount('Taxable',      'taxable'),
        hsa:       blankAccount('HSA',          'hsa'),
        cash:      blankAccount('Cash/Emergency','cash')
      },
      properties: [],
      farmland: [],
      business: null,
      // Personal residences (separate from investment properties; different tax treatment)
      primaryHome: null,                  // { value, basis, mortgage, rate, monthlyPI, yearAcquired, improvementsToDate }
      secondaryHome: null,                // same shape; vacation/second home
      lastSec121Year: null,               // year of last primary-residence sale claiming §121
      // Joseph reserve: 0..1 fraction of contributions/cash flow to divert during "plenty"
      reserveBucket: 0,                   // dollar value of dedicated reserve store
      // Generosity tracker (lifetime giving)
      lifetimeCharity: 0,
      stewardshipScore: 0,
      // Lifetime dollars absorbed into lifestyle (unassigned cash that got spent)
      lifetimeLifestyle: 0,
      // Career earnings ledger (capped at SS wage base) for AIME at claim time
      ssEarnings: [],
      // Cumulative CPI since game start — indexes SS bend points/wage base so
      // the benefit formula stays commensurate with decades of nominal wages
      cpiFactor: 1,
      // Section 121 / serial-residence event log
      sec121Events: [],
      // Strategy persistent until changed by player
      strategy: {
        savingsRate: 0.15,
        accountPriority: ['roth401k','rothIRA','hsa','trad401k','taxable'],
        alloc: { ...DEFAULT_ALLOC },
        rebalanceAnnually: true,
        // Months of spending deliberately held in cash. Cash above this target
        // is unassigned and subject to lifestyle absorption; raise it when
        // saving toward a down payment or other purchase.
        cashTargetMonths: 6,
        rothConvertTarget: 0,
        spendingCurve: 'flat',
        leverageMax: 0.75,
        // New: Joseph reserve fraction of excess cash flow during plenty years
        josephReserveRate: 0,         // 0..0.25
        // New: Cycle-rhythm deploy reserve when last year was a big drawdown
        cycleRhythmDeploy: false,
        // New: Default charitable giving fraction of pre-tax income
        charitableRate: 0,            // 0..0.10
        // New: Annual home maintenance & property tax baseline (auto-deducted from cash)
        homeMaintenance: 0.01         // 1% of home value per year
      },
      birthYear: opts.yearStart - opts.age,
    };
    // Assume continuous prior employment at the starting wage for players who
    // begin mid-life, so the AIME approximation isn't zero-filled.
    for (let a = 22; a < opts.age; a++){
      state.ssEarnings.push(Math.min(opts.wages, SS_WAGE_BASE));
    }
    // Pre-set historical start if random. Derived from its own seeded stream so
    // it never consumes a draw from life/market streams (companion sims created
    // from the same opts must stay stream-aligned with the original).
    if (opts.historicalMode === 'random' && !opts.histStart){
      const span = H.sp500.length - 60; // pick a start that allows ~60 yrs of history
      opts.histStart = H.start + Math.floor(rng(seed + 69069).next() * span);
    }
    return state;
  }

  function effectiveYear(state){
    // Map game year to historical lookup year if needed
    if (state.opts.historicalMode === 'random' && state.opts.histStart != null){
      return state.opts.histStart + (state.year - state.opts.yearStart);
    }
    return state.year;
  }

  // ---- Yearly tick ----
  // rOverride: a full returns object recorded from another sim's log — lets a
  // companion ("ghost") sim live through the identical market year.
  function tick(state, decisions, rOverride){
    decisions = decisions || {};
    const ey = effectiveYear(state);
    const r = rOverride || drawReturns(state, ey);

    const log = { year: state.year, age: state.age, ey, event: r.event,
                  marketReturn: r.stocks, infl: r.cpi,
                  returns: r };

    // 1. Career income (pre-retirement). Wage growth applies at END of tick so
    // the year's cash credit and the year's tax bill use the same number.
    let wages = 0;
    if (!state.retired){
      wages = state.wages;
      state.careerYears += 1;
      state.ssEarnings.push(Math.min(wages, SS_WAGE_BASE * state.cpiFactor));
    }
    log.wages = wages;
    // Spending base inflates each year regardless of working/retired status
    state._cpiYear = r.cpi;
    state.cpiFactor *= (1 + Math.max(0, r.cpi));

    // Capture prior allocation for pattern scoring (e.g. panic-selling).
    // Decisions must route allocation changes through d.changeStrategy so this
    // snapshot is genuinely "before".
    state._priorAlloc = { ...state.strategy.alloc };
    // Realized gains from deliberate trades this year (allocation shifts,
    // liquidations for purchases) — taxed as LTCG below.
    state._tradeGains = 0;

    // 2. Apply decisions: contributions, allocation changes, real estate, business
    applyDecisions(state, decisions, r, wages);

    // 3. Generate income from real assets and dividends
    const dividendYield = 0.018; // S&P 500 qualified dividend yield
    const reitYield = 0.04;
    const bondCoupon = 0.04;
    const taxableSleeves = sleevedYields(state.accounts.taxable.alloc, state.accounts.taxable.balance, dividendYield, reitYield, bondCoupon);

    // Primary and secondary residences: appreciate, amortize, maintain.
    let mortgageInterestPaid = 0, propertyTaxPaid = 0;
    for (const home of [state.primaryHome, state.secondaryHome]){
      if (!home) continue;
      const ip = home.mortgage * home.rate;
      mortgageInterestPaid += ip;
      const principal = Math.max(0, home.monthlyPI*12 - ip);
      home.mortgage = Math.max(0, home.mortgage - principal);
      home.value *= (1 + r.housing);
      const maint = home.value * state.strategy.homeMaintenance;
      const ptax = home.value * 0.008;            // ~0.8% effective AL property tax
      state.accounts.cash.balance -= (maint + ptax + home.monthlyPI*12);
      propertyTaxPaid += ptax;
    }

    let rentalNet = 0, rentalDepr = 0, rentalCash = 0;
    for (const p of state.properties){
      const grossRent = p.kind === 'STR' ? p.value * p.capRate * 1.7 : p.value * p.capRate;
      const opEx = grossRent * (p.kind === 'STR' ? 0.45 : 0.30);
      const mortInterest = p.mortgage * p.rate;
      const dep = Math.min(p.depSchedule, p.basis - p.depPrior);
      const netRental = grossRent - opEx - mortInterest - dep;
      p.depPrior += dep;
      rentalNet += netRental;
      rentalDepr += dep;
      // Amortize principal: reduce mortgage
      const principalPaid = Math.max(0, p.monthlyPI*12 - mortInterest);
      p.mortgage = Math.max(0, p.mortgage - principalPaid);
      // Actual cash the owner pockets: rent minus opEx, interest AND principal
      // (depreciation is a paper deduction, principal is cash but not expense).
      rentalCash += grossRent - opEx - mortInterest - principalPaid;
      // Appreciate property
      p.value *= (1 + r.housing);
    }
    let farmNet = 0;
    for (const f of state.farmland){
      const cashRent = f.value * 0.03; // ~3% cash rent
      farmNet += cashRent;
      f.value *= (1 + r.farm);
    }
    let businessNet = 0;
    if (state.business){
      const b = state.business;
      const success = state.rng.next();
      let growth = 0;
      if (success < 0.04) {
        // failure event
        b.value *= 0.3;
        log.businessShock = 'major loss';
      } else {
        growth = state.rng.normal(0.10, 0.30);
        b.value = Math.max(0, b.value * (1 + growth));
      }
      businessNet = b.cashFlow * (1 + growth*0.5);
      b.cashFlow = businessNet;
    }
    // Real-asset income is real money: credit it to cash. Retirement spending
    // then draws from cash first, so it is not double-counted by withdraw().
    state.accounts.cash.balance += rentalCash + farmNet + businessNet;

    // 4. Grow liquid accounts, sleeve by sleeve. Weights DRIFT with returns:
    // a portfolio left alone becomes what its winners make it. Annual
    // rebalancing (step 10) resets weights to the written policy.
    const SLEEVE_RETURNS = { stocks: r.stocks, bonds: r.bonds, cash: r.tbill,
                             reit: r.reit, metals: r.gold };
    for (const k of ['roth401k','rothIRA','trad401k','tradIRA','taxable','hsa','cash']){
      const a = state.accounts[k];
      if (k === 'cash'){
        a.balance *= (1 + r.tbill);
        continue;
      }
      if (a.balance <= 0) continue;
      let newBal = 0, sumW = 0;
      const grown = {};
      for (const s in SLEEVE_RETURNS){
        const w = a.alloc[s] || 0;
        sumW += w;
        grown[s] = a.balance * w * (1 + SLEEVE_RETURNS[s]);
        newBal += grown[s];
      }
      // Any unallocated remainder behaves like cash
      if (sumW < 0.999) newBal += a.balance * (1 - sumW) * (1 + r.tbill);
      if (newBal > 0){
        for (const s in grown) a.alloc[s] = grown[s] / newBal;
      }
      a.balance = newBal;
    }

    // 5. Required Minimum Distributions
    let rmd = 0;
    const rmdStart = T.rmdStartAge(state.birthYear);
    if (state.age >= rmdStart){
      const div = T.rmdDivisor(state.age);
      if (div){
        rmd = (state.accounts.trad401k.balance + state.accounts.tradIRA.balance) / div;
        const split401k = state.accounts.trad401k.balance / Math.max(1,
                          state.accounts.trad401k.balance + state.accounts.tradIRA.balance);
        state.accounts.trad401k.balance -= rmd * split401k;
        state.accounts.tradIRA.balance  -= rmd * (1 - split401k);
        // Goes to cash account
        state.accounts.cash.balance += rmd;
      }
    }

    // 6. Social Security
    let ss = 0;
    if (state.retired){
      // auto-claim at 70 if not claimed by then
      if (!state.ssClaimed && state.age >= 70){
        claimSS(state);
      }
      if (state.ssClaimed){
        state.ssAnnual *= (1 + r.cpi); // COLA
        ss = state.ssAnnual;
      }
    }

    // 7. Resolve player-directed withdrawals/spending. Real-asset income was
    // already credited to cash (withdraw drains cash first), so only SS
    // offsets the need directly.
    const spendTarget = computeSpend(state, r.cpi);
    const wd = withdraw(state, spendTarget - ss, decisions);

    // Section 121 sale of primary home (if requested)
    let homeSaleExcluded = 0, homeSaleTaxable = 0, homeSaleCash = 0;
    if (decisions.sellPrimary && state.primaryHome){
      const home = state.primaryHome;
      const yearsOwned = state.year - home.yearAcquired;
      const grossGain = Math.max(0, home.value - home.basis);
      const sec121 = T.section121(grossGain, state.opts.status, state.year, state.lastSec121Year);
      // Require minimum 2-year occupancy for §121
      if (sec121.allowed && yearsOwned >= 2){
        state.lastSec121Year = state.year;
        state.sec121Events.push({ year: state.year, grossGain, excluded: sec121.excluded, taxable: sec121.taxable });
      }
      homeSaleExcluded = sec121.allowed && yearsOwned >= 2 ? sec121.excluded : 0;
      homeSaleTaxable = grossGain - homeSaleExcluded;
      homeSaleCash = home.value - home.mortgage - home.value * 0.06; // 6% transaction costs
      state.accounts.cash.balance += homeSaleCash;
      state.primaryHome = null;
      state.messages.push({ year: state.year, level: 'info',
        msg: `Sold primary residence: gain $${Math.round(grossGain).toLocaleString()}, §121 excluded $${Math.round(homeSaleExcluded).toLocaleString()}.` });
    }

    // QCD requested (only relevant if RMD active and age ≥ 70.5)
    const qcdApplied = T.qcdOffset(state.age, rmd, decisions.qcd || 0);
    if (qcdApplied > 0){
      // QCD is the donation; cash leaves the IRA to charity, not to cash
      state.lifetimeCharity += qcdApplied;
      state.accounts.cash.balance -= qcdApplied; // RMD already credited cash; now donate
    }

    // Compute metals-portion realized gain (only when withdrawn -- we approximate annually)
    const metalsRealized = (state.strategy.alloc.metals||0) > 0
      ? state.accounts.taxable.balance * (state.strategy.alloc.metals||0) * 0.02 * Math.max(0, r.gold)
      : 0;

    // 8. Compute taxes -- only pre-tax (Trad) contributions reduce wage AGI
    const taxInputs = {
      status: state.opts.status,
      age: state.age,
      ageSpouse: state.ageSpouse,
      wages: wages,
      interest: taxableSleeves.interest,
      qualDiv: taxableSleeves.qualDiv,
      ordDiv:  taxableSleeves.ordDiv,
      stcg: 0,
      ltcg: wd.taxableGains + homeSaleTaxable + (state._tradeGains || 0) + (state._carryLtcg || 0),
      ltcgCollect: metalsRealized,
      iraWithdraw: wd.tradWithdraw + rmd + (state._carryOrd || 0),
      rothConvert: decisions.rothConvert || 0,
      qcd: qcdApplied,
      ssGross: ss,
      businessNet: businessNet,
      rentalNet: rentalNet + farmNet,
      hsaContrib: decisions.hsaContrib || 0,
      k401Contrib: decisions.trad401k || 0,
      tradIRAContrib: decisions.tradIRA || 0,
      charitable: (decisions.charitable || 0),
      mortgageInterest: mortgageInterestPaid,
      propertyTax: propertyTaxPaid,
      stateIncomeTaxPaid: 0,
      itemizedExtra: 0
    };
    const t = T.calc(taxInputs);
    const fica = wages > 0 ? T.fica(wages, state.opts.status) : 0;
    const totalTax = t.fed + t.state + t.irmaa + fica;
    state.cumulativeTaxes += totalTax;
    // Deduct taxes from cash
    state.accounts.cash.balance -= totalTax;
    // The carried income from last year's forced liquidation has now been taxed
    state._carryOrd = 0;
    state._carryLtcg = 0;

    // If cash is overdrawn (taxes, housing, health costs beyond the buffer),
    // liquidate investments to cover it — a real sale. Its gains/ordinary
    // income are carried into NEXT year's return (one-year approximation).
    if (state.accounts.cash.balance < 0){
      const shortfall = -state.accounts.cash.balance;
      const cover = withdraw(state, shortfall, decisions, true);
      state._carryLtcg = cover.taxableGains;
      state._carryOrd = cover.tradWithdraw;
      log.forcedLiquidation = cover.taxableSold + cover.tradWithdraw + cover.rothWithdraw;
    }

    // 9. Execute Roth conversion if requested
    if (decisions.rothConvert){
      const amt = Math.min(decisions.rothConvert,
                           state.accounts.tradIRA.balance + state.accounts.trad401k.balance);
      const fromIRA = Math.min(amt, state.accounts.tradIRA.balance);
      state.accounts.tradIRA.balance -= fromIRA;
      const from401k = amt - fromIRA;
      state.accounts.trad401k.balance -= from401k;
      state.accounts.rothIRA.balance  += amt;
    }

    // 10. Annual rebalance
    if (state.strategy.rebalanceAnnually) rebalanceAll(state);

    log.spendTarget = state.retired ? spendTarget : state.spendBase;
    log.rmd = rmd;
    log.ss = ss;
    log.rentalNet = rentalNet;
    log.farmNet = farmNet;
    log.businessNet = businessNet;
    log.tax = totalTax;
    log.taxBreakdown = t;
    log.totalReturn = sleeveReturn(state.strategy.alloc, r);
    log.charitable = (decisions.charitable || 0) + qcdApplied;
    log.homeSale = homeSaleCash;
    log.sec121Excluded = homeSaleExcluded;
    log.reserveBucket = state.reserveBucket;
    log.tradeGains = state._tradeGains || 0;
    // Decision echoes used by achievements (max-401k, roth-conv-50)
    log._d_roth401k = decisions.roth401k || 0;
    log._d_trad401k = decisions.trad401k || 0;
    log._rothConv = decisions.rothConvert || 0;
    state.lifetimeCharity += (decisions.charitable || 0);
    // Deduct charitable from cash
    state.accounts.cash.balance -= (decisions.charitable || 0);

    // Joseph reserve: in years following positive market (plenty), divert savings to reserve.
    if (!state.retired && state.strategy.josephReserveRate > 0 && r.stocks > 0.05){
      const skim = state.accounts.cash.balance * state.strategy.josephReserveRate * 0.25;
      if (skim > 0){
        state.accounts.cash.balance -= skim;
        state.reserveBucket += skim;
      }
    }
    // Grow reserve at T-bill (safe storage)
    state.reserveBucket *= (1 + r.tbill);

    // Cycle Rhythm: deploy reserves into equities after a major drawdown (last year < -15%)
    const lastLog = state.history[state.history.length-1];
    if (state.strategy.cycleRhythmDeploy && lastLog && lastLog.marketReturn < -0.15 && state.reserveBucket > 0){
      const deploy = state.reserveBucket * 0.5;
      state.reserveBucket -= deploy;
      state.accounts.taxable.balance += deploy;
      state.accounts.taxable.basis += deploy;
      state.messages.push({ year: state.year, level: 'info',
        msg: `Cycle Rhythm: deployed $${Math.round(deploy).toLocaleString()} of reserves into equities after a -${Math.round(-lastLog.marketReturn*100)}% drawdown.` });
    }

    // Lifestyle absorption: unassigned cash above the deliberate cash target
    // drifts into consumption during working years. Every deliberate flow
    // (contributions, reserves, purchases, giving) has already been taken.
    log.lifestyle = 0;
    if (!state.retired){
      const cashTarget = state.spendBase * (state.strategy.cashTargetMonths || 6) / 12;
      const excess = state.accounts.cash.balance - cashTarget;
      if (excess > 0){
        const absorbed = excess * LIFESTYLE_ABSORPTION;
        state.accounts.cash.balance -= absorbed;
        state.lifetimeLifestyle += absorbed;
        log.lifestyle = absorbed;
      }
    }

    log.netWorth = netWorth(state);
    state.history.push(log);

    // 11. Pattern scoring
    GAME.patterns && GAME.patterns.score(state, decisions, log, r);

    // 12. Wage growth for next year (real growth above CPI)
    if (!state.retired){
      state.wages *= (1 + state.opts.wageGrowth + Math.max(0, r.cpi));
    }

    // 13. Mortality / time advance. Ghost sims share their owner's lifespan
    // (the runner stops them); they never roll their own death.
    state.age += 1;
    if (state.opts.status === 'mfj') state.ageSpouse += 1;
    state.year += 1;
    if (!state.isGhost){
      const deathRoll = state.rng.next();
      if (state.age >= 105) state.living = false;
      else if (state.age >= 80 && deathRoll < mortality(state.age)) state.living = false;
    } else if (state.age >= 105) {
      state.living = false;
    }

    return log;
  }

  // Mortality probability (approximate SSA life tables, unisex)
  function mortality(age){
    if (age < 60)  return 0.005;
    if (age < 70)  return 0.012;
    if (age < 75)  return 0.022;
    if (age < 80)  return 0.038;
    if (age < 85)  return 0.065;
    if (age < 90)  return 0.110;
    if (age < 95)  return 0.180;
    return 0.250;
  }

  // ---- Helpers ----
  function sleevedYields(alloc, balance, divY, reitY, bondY){
    return {
      qualDiv: balance * (alloc.stocks||0) * divY,
      ordDiv:  balance * (alloc.reit||0)   * reitY,
      interest: balance * ((alloc.bonds||0) + (alloc.cash||0)) * bondY
    };
  }
  function netWorth(state){
    let nw = 0;
    for (const k in state.accounts) nw += state.accounts[k].balance;
    for (const p of state.properties) nw += (p.value - p.mortgage);
    for (const f of state.farmland)   nw += f.value;
    if (state.business) nw += state.business.value;
    if (state.primaryHome)   nw += (state.primaryHome.value   - state.primaryHome.mortgage);
    if (state.secondaryHome) nw += (state.secondaryHome.value - state.secondaryHome.mortgage);
    nw += state.reserveBucket || 0;
    return nw;
  }
  function rebalanceAll(state){
    for (const k of ['roth401k','rothIRA','trad401k','tradIRA','taxable','hsa']){
      state.accounts[k].alloc = { ...state.strategy.alloc };
    }
  }
  function computeSpend(state, cpi){
    // Inflate baseline spending every year so cash-heavy portfolios feel it
    state.spendBase *= (1 + Math.max(0, cpi));
    if (!state.retired) return 0;
    let baseReal = state.spendBase;
    if (state.strategy.spendingCurve === 'smile'){
      const yrsRetired = state.age - state.retiredAt;
      if (yrsRetired < 10) baseReal *= 1.15;
      else if (yrsRetired < 20) baseReal *= 0.85;
      else baseReal *= 0.95;
    } else if (state.strategy.spendingCurve === 'declining'){
      const yrsRetired = state.age - state.retiredAt;
      baseReal *= Math.pow(0.99, yrsRetired);
    }
    return baseReal;
  }
  function withdraw(state, need, decisions, creditCash){
    let out = { tradWithdraw: 0, rothWithdraw: 0, taxableSold: 0, taxableGains: 0 };
    if (need <= 0) return out;
    // Priority: cash -> taxable -> trad -> roth (default tax-optimal late retirement)
    const order = state.strategy.withdrawOrder || ['cash','taxable','trad401k','tradIRA','rothIRA','roth401k'];
    for (const k of order){
      if (need <= 0) break;
      if (creditCash && k === 'cash') continue;
      const a = state.accounts[k];
      if (!a || a.balance <= 0) continue;
      const take = Math.min(a.balance, need);
      a.balance -= take;
      need -= take;
      if (creditCash) state.accounts.cash.balance += take;
      if (k === 'taxable'){
        out.taxableSold += take;
        // Realized LTCG from the actual tracked basis (pro-rata lot sale)
        const preBal = a.balance + take;
        const gainFrac = preBal > 0 ? Math.max(0, Math.min(1, (preBal - a.basis) / preBal)) : 0;
        out.taxableGains += take * gainFrac;
        a.basis = Math.max(0, a.basis - take * (1 - gainFrac));
      } else if (k === 'trad401k' || k === 'tradIRA'){
        out.tradWithdraw += take;
      } else if (k === 'rothIRA' || k === 'roth401k'){
        out.rothWithdraw += take;
      }
    }
    if (need > 0){
      state.messages.push({ year: state.year, level: 'critical',
        msg: `Shortfall of $${Math.round(need).toLocaleString()} — accounts depleted.` });
      state.cashShortfall = true;
    }
    return out;
  }
  // Normalize an allocation object so sleeve weights sum to exactly 1.
  function normalizeAlloc(raw){
    const a = { stocks: raw.stocks||0, bonds: raw.bonds||0, cash: raw.cash||0,
                reit: raw.reit||0, metals: raw.metals||0 };
    const sum = a.stocks + a.bonds + a.cash + a.reit + a.metals;
    if (sum > 0 && Math.abs(sum - 1) > 0.0001){
      for (const k in a) a[k] = a[k] / sum;
    }
    return a;
  }

  // Changing allocation IS a trade. Apply the new weights to every liquid
  // account immediately; in the taxable account, reducing risk sleeves sells
  // appreciated shares and realizes LTCG (reinvested proceeds re-enter at
  // full basis, so net basis rises by the realized gain).
  function applyAllocation(state, allocRaw){
    const alloc = normalizeAlloc(allocRaw);
    const tx = state.accounts.taxable;
    if (tx.balance > 0){
      let soldFrac = 0;
      for (const k of ['stocks','bonds','reit','metals']){
        soldFrac += Math.max(0, (tx.alloc[k]||0) - (alloc[k]||0));
      }
      if (soldFrac > 0.001){
        const sold = tx.balance * soldFrac;
        const gainFrac = Math.max(0, Math.min(1, (tx.balance - tx.basis) / tx.balance));
        const gains = sold * gainFrac;
        state._tradeGains = (state._tradeGains || 0) + gains;
        tx.basis += gains;
      }
    }
    state.strategy.alloc = alloc;
    for (const k of ['roth401k','rothIRA','trad401k','tradIRA','taxable','hsa']){
      state.accounts[k].alloc = { ...alloc };
    }
  }

  // Raise `amount` into cash for a purchase, liquidating taxable holdings if
  // cash falls short (a real sale — realizes LTCG). Returns false if even
  // that cannot cover it.
  function raiseCash(state, amount){
    if (state.accounts.cash.balance >= amount) return true;
    const tx = state.accounts.taxable;
    const shortfall = amount - state.accounts.cash.balance;
    if (tx.balance < shortfall) return false;
    const gainFrac = tx.balance > 0
      ? Math.max(0, Math.min(1, (tx.balance - tx.basis) / tx.balance)) : 0;
    tx.balance -= shortfall;
    tx.basis = Math.max(0, tx.basis - shortfall * (1 - gainFrac));
    state._tradeGains = (state._tradeGains || 0) + shortfall * gainFrac;
    state.accounts.cash.balance += shortfall;
    state.messages.push({ year: state.year, level: 'info',
      msg: `Sold $${Math.round(shortfall).toLocaleString()} from taxable brokerage to fund purchase.` });
    return true;
  }

  function applyDecisions(state, d, r, wages){
    function contribute(acctKey, amt){
      if (amt <= 0) return;
      // pay from cash; assume cash account always credits incoming wages
      state.accounts.cash.balance -= amt;
      state.accounts[acctKey].balance += amt;
      if (acctKey === 'taxable') state.accounts.taxable.basis += amt;
    }
    // Strategy changes apply first: an allocation change is a trade made at
    // the start of the year, before returns land.
    if (d.changeStrategy){
      const cs = d.changeStrategy;
      if (cs.alloc) applyAllocation(state, cs.alloc);
      for (const k in cs){
        if (k !== 'alloc') state.strategy[k] = cs[k];
      }
    }
    // Credit this year's wages to cash (same figure the tax engine sees)
    if (!state.retired) state.accounts.cash.balance += (wages != null ? wages : state.wages);
    // Subtract base living expenses for working years
    if (!state.retired){
      state.accounts.cash.balance -= state.spendBase;
    }
    if (d.roth401k)  contribute('roth401k', d.roth401k);
    if (d.trad401k)  contribute('trad401k', d.trad401k);
    if (d.rothIRA)   contribute('rothIRA',  d.rothIRA);
    if (d.tradIRA)   contribute('tradIRA',  d.tradIRA);
    if (d.taxable)   contribute('taxable',  d.taxable);
    if (d.hsaContrib) contribute('hsa',     d.hsaContrib);
    // Property purchase
    if (d.buyProperty){
      const cost = d.buyProperty.price;
      const dp = d.buyProperty.downPct || 0.25;
      const cash = cost * dp;
      if (raiseCash(state, cash)){
        state.accounts.cash.balance -= cash;
        const p = blankProperty(cost, dp, d.buyProperty.rate || 0.065,
                                d.buyProperty.term || 30, d.buyProperty.cap || PROPERTY_CAP,
                                d.buyProperty.isSTR);
        p.yearAcquired = state.year;
        state.properties.push(p);
        state.messages.push({ year: state.year, level: 'info',
          msg: `Acquired ${p.kind} property at $${Math.round(cost).toLocaleString()}.` });
      } else {
        state.messages.push({ year: state.year, level: 'warn',
          msg: `Insufficient cash for down payment.` });
      }
    }
    if (d.buyFarm){
      const cost = d.buyFarm.price;
      if (raiseCash(state, cost)){
        state.accounts.cash.balance -= cost;
        state.farmland.push({ value: cost, basis: cost });
        state.messages.push({ year: state.year, level: 'info',
          msg: `Acquired farmland at $${Math.round(cost).toLocaleString()}.` });
      }
    }
    if (d.startBusiness){
      const cost = d.startBusiness.investment;
      if (raiseCash(state, cost)){
        state.accounts.cash.balance -= cost;
        state.business = { value: cost, cashFlow: cost * 0.1, started: state.year };
        state.messages.push({ year: state.year, level: 'info',
          msg: `Started business with $${Math.round(cost).toLocaleString()} invested.` });
      }
    }
    if (d.retire && !state.retired){
      state.retired = true;
      state.retiredAt = state.age;
      state.messages.push({ year: state.year, level: 'info',
        msg: `Retired at age ${state.age}.` });
    }
    if (d.claimSS && !state.ssClaimed){
      claimSS(state);
    }
    // Primary residence purchase
    if (d.buyPrimary){
      const cost = d.buyPrimary.price;
      const dp = d.buyPrimary.downPct || 0.20;
      const cash = cost * dp;
      if (raiseCash(state, cash)){
        state.accounts.cash.balance -= cash;
        const loan = cost - cash;
        const rate = d.buyPrimary.rate || 0.065;
        const term = d.buyPrimary.term || 30;
        state.primaryHome = {
          value: cost, basis: cost,
          mortgage: loan, rate, termYears: term,
          monthlyPI: amortPI(loan, rate, term),
          yearAcquired: state.year,
          improvementsToDate: 0
        };
        state.messages.push({ year: state.year, level: 'info',
          msg: `Purchased primary residence for $${Math.round(cost).toLocaleString()}.` });
      } else {
        state.messages.push({ year: state.year, level: 'warn',
          msg: `Insufficient cash for primary down payment ($${Math.round(cash).toLocaleString()} needed).` });
      }
    }
    // Primary home improvements (capital -> raise basis)
    if (d.improvePrimary && state.primaryHome){
      const cost = d.improvePrimary.cost || 0;
      if (raiseCash(state, cost)){
        state.accounts.cash.balance -= cost;
        state.primaryHome.basis += cost;
        state.primaryHome.improvementsToDate += cost;
        state.primaryHome.value += cost * (d.improvePrimary.valueMultiplier || 1.5);
      }
    }
    // Secondary residence (vacation/second home)
    if (d.buySecondary){
      const cost = d.buySecondary.price;
      const dp = d.buySecondary.downPct || 0.25;
      const cash = cost * dp;
      if (raiseCash(state, cash)){
        state.accounts.cash.balance -= cash;
        const loan = cost - cash;
        const rate = d.buySecondary.rate || 0.075;
        const term = d.buySecondary.term || 30;
        state.secondaryHome = {
          value: cost, basis: cost,
          mortgage: loan, rate, termYears: term,
          monthlyPI: amortPI(loan, rate, term),
          yearAcquired: state.year
        };
        state.messages.push({ year: state.year, level: 'info',
          msg: `Purchased secondary residence for $${Math.round(cost).toLocaleString()}.` });
      }
    }
  }

  function claimSS(state){
    state.ssClaimed = true;
    state.ssClaimAge = state.age;
    // AIME from the career earnings ledger: top 35 years of capped wages,
    // divided by 35 regardless of years worked (SSA formula, unindexed
    // simplification — short careers earn genuinely smaller benefits).
    const top35 = state.ssEarnings.slice().sort((a,b)=>b-a).slice(0,35);
    const aime = (top35.reduce((s,x)=>s+x,0) / 35) / 12;
    // 2026 bend points (estimated), indexed by cumulative CPI so the formula
    // keeps pace with a lifetime of nominal wage growth
    const bp1 = 1226 * state.cpiFactor, bp2 = 7391 * state.cpiFactor;
    let pia = 0;
    if (aime <= bp1) pia = 0.9 * aime;
    else if (aime <= bp2) pia = 0.9*bp1 + 0.32*(aime-bp1);
    else pia = 0.9*bp1 + 0.32*(bp2-bp1) + 0.15*(aime-bp2);
    const fra = 67;
    let factor;
    if (state.age < fra) factor = 1 - (fra - state.age) * 0.065;
    else if (state.age > fra) factor = 1 + (state.age - fra) * 0.08;
    else factor = 1.0;
    factor = Math.max(0.70, Math.min(1.32, factor));
    state.ssAnnual = pia * 12 * factor;
    state.ssBaseBenefit = state.ssAnnual;
    state.messages.push({ year: state.year, level: 'info',
      msg: `Claimed Social Security at age ${state.age} — $${Math.round(state.ssAnnual).toLocaleString()}/yr.` });
  }

  // ---- Suggested decision (auto-pilot) following the pattern language ----
  function suggest(state){
    const d = {};
    const w = state.wages;
    const status = state.opts.status;
    if (!state.retired){
      // Default rate: 15% pre-tax up to 401k limit ($23.5k 2026), then Roth IRA, then taxable
      const k401limit = state.age >= 50 ? 31000 : 23500;
      const iraLimit = state.age >= 50 ? 8500 : 7500;
      const hsaLimit = 4300;
      // Estimate take-home after rough 22% effective tax + FICA on wages.
      // The emergency buffer is a STOCK, not an annual flow: only the amount
      // still needed to top the cash target up competes with saving this year.
      const estTax = Math.max(0, w * 0.22);
      const takeHome = Math.max(0, w - estTax);
      const cashTarget = state.spendBase * (state.strategy.cashTargetMonths || 6) / 12;
      const bufferTopUp = Math.max(0, cashTarget - state.accounts.cash.balance);
      const available = Math.max(0, takeHome - state.spendBase - bufferTopUp);
      const totalSaving = Math.max(0, Math.min(w * state.strategy.savingsRate, available));
      // Allocate by priority
      let remaining = totalSaving;
      // Early career: heavy Roth
      const earlyCareer = state.age < 35;
      const lateCareer = state.age >= 50;
      if (earlyCareer){
        const r401 = Math.min(remaining, k401limit);
        d.roth401k = r401; remaining -= r401;
        const rIRA = Math.min(remaining, iraLimit);
        d.rothIRA = rIRA; remaining -= rIRA;
      } else if (lateCareer){
        const t401 = Math.min(remaining, k401limit);
        d.trad401k = t401; remaining -= t401;
        const rIRA = Math.min(remaining, iraLimit);
        d.rothIRA = rIRA; remaining -= rIRA;
      } else {
        const t401 = Math.min(remaining, k401limit);
        d.trad401k = Math.round(t401 * 0.6);
        d.roth401k = Math.round(t401 * 0.4);
        remaining -= t401;
        const rIRA = Math.min(remaining, iraLimit);
        d.rothIRA = rIRA; remaining -= rIRA;
      }
      d.hsaContrib = Math.min(remaining, hsaLimit);
      remaining -= d.hsaContrib;
      if (remaining > 0) d.taxable = remaining;
    }
    // Suggested allocation by age (returned as a decision; does NOT mutate
    // strategy). Weights sum to exactly 1: stocks glide down with age, a 5%
    // metals sleeve per the pattern catalog, bonds take the remainder.
    const eqPct = Math.max(0.30, Math.min(0.90, 1.15 - state.age * 0.01));
    d.suggestedAlloc = {
      stocks: eqPct,
      bonds: Math.max(0, 1 - eqPct - 0.05 - 0.05),
      cash: 0.05,
      reit: 0,
      metals: 0.05
    };
    // Pre-retirement: Roth conversion ladder in low-income gap years
    if (state.retired && state.age < T.rmdStartAge(state.birthYear) && !state.ssClaimed){
      // Convert to top of 22% bracket
      const targetCeiling = status === 'mfj' ? 211400 : 105700;
      d.rothConvert = Math.max(0, targetCeiling - 60000);
    }
    // Auto-claim SS at 70
    if (state.retired && !state.ssClaimed && state.age >= 70) d.claimSS = true;
    return d;
  }

  // ---------------------------------------------------------------------------
  // Mainstream Autopilot — encodes what published mainstream advice actually says.
  //
  // Sources verified 2026-05:
  //  - Savings rate 7.7% average deferral: Vanguard "How America Saves 2025".
  //  - Glide path 90% equity at 25 → 50% at 65 → 30% at 72: Vanguard TDF
  //    (workplace.vanguard.com/investment/strategies/tdf-glide-path.html).
  //  - SS claim at FRA (67): SSA 2024 data — ~25% of new claimants claim at 66,
  //    ~14% at 67, mode in the FRA range. Most CFPs default to FRA.
  //  - 4% withdrawal rule: still the dominant published guideline; Morningstar
  //    2026 base case for balanced portfolio is 3.9%, Bengen revised upward to
  //    4.7%, but the *taught* rule remains 4% in most consumer-facing material.
  //
  // What it does NOT do (these are exactly the patterns being benchmarked):
  // Roth conversions, §121 cycling, real estate beyond primary, metals,
  // business equity, Joseph reserves, Cycle Rhythm deploys, QCDs, charitable
  // strategy integration, tax-loss harvesting.
  // ---------------------------------------------------------------------------
  function mainstreamSuggest(state){
    const d = {};
    const w = state.wages;
    if (!state.retired){
      // 7.7% deferral, 401(k) up to typical match coverage (6%) + Roth IRA
      const deferral = w * 0.077;
      const k401limit = state.age >= 50 ? 31000 : 23500;
      const iraLimit = state.age >= 50 ? 8500 : 7500;
      let remaining = Math.min(deferral, k401limit + iraLimit);
      // Mainstream: target-date fund in the 401(k), so route everything to trad 401(k)
      // first up to the 401(k) cap, then Roth IRA spillover.
      const k = Math.min(remaining, k401limit);
      d.trad401k = k;
      remaining -= k;
      if (remaining > 0){
        d.rothIRA = Math.min(remaining, iraLimit);
      }
    }
    // Vanguard TDF glide path (straight line).
    let eqPct;
    if (state.age <= 25) eqPct = 0.90;
    else if (state.age >= 72) eqPct = 0.30;
    else if (state.age <= 65) eqPct = 0.90 - (state.age - 25) * (0.40 / 40);  // 90% → 50% from 25 to 65
    else eqPct = 0.50 - (state.age - 65) * (0.20 / 7);                          // 50% → 30% from 65 to 72
    d.suggestedAlloc = {
      stocks: eqPct,
      bonds: 1 - eqPct - 0.03,
      cash: 0.03,
      reit: 0,
      metals: 0
    };
    // SS at FRA (67), not delayed
    if (state.retired && !state.ssClaimed && state.age >= 67) d.claimSS = true;
    return d;
  }

  return { newGame, tick, suggest, mainstreamSuggest, netWorth, claimSS, drawReturns, effectiveYear };
})();
