/*
 * Pattern language: adherence scoring and contextual guidance.
 *
 * Each pattern declares:
 *   id, name, layer, life-stage trigger, score(state, decisions, log, r),
 *   guidance(state) returning short markdown.
 *
 * Score is awarded when player behavior matches the pattern in a given year.
 * Violations are also recorded so the end-of-game report shows tradeoffs.
 */
window.GAME = window.GAME || {};
GAME.patterns = (function () {

  const PATTERNS = [
    {
      id: 'compound-early',
      name: 'Compound Early and Often',
      layer: 'foundational',
      score(state, d, log){
        if (state.retired) return 0;
        const rate = (d.roth401k||0)+(d.trad401k||0)+(d.rothIRA||0)+(d.tradIRA||0)+(d.taxable||0);
        const savedRatio = state.wages > 0 ? rate / state.wages : 0;
        if (state.age < 35 && savedRatio >= 0.15) return +2;
        if (savedRatio >= 0.10) return +1;
        if (savedRatio < 0.05 && state.age < 50) return -1;
        return 0;
      },
      guidance(state){
        if (state.age < 35) return "Your highest-leverage decade. Aim 15-20%+ to Roth-heavy accounts.";
        if (state.age < 50) return "Compounding still strong. Keep 401(k) max + IRA + HSA filled.";
        return "Catch-up contributions available at 50+.";
      }
    },
    {
      id: 'broad-ownership',
      name: 'Own the Market Broadly',
      layer: 'foundational',
      score(state){
        const a = state.strategy.alloc;
        if ((a.stocks||0) >= 0.50 && (a.cash||0) <= 0.10 && (a.bonds||0) <= 0.50) return +1;
        return 0;
      },
      guidance(){ return "Low-cost total-market index funds; minimize active drag."; }
    },
    {
      id: 'diversify-seasons',
      name: 'Diversify Across Seasons and Assets',
      layer: 'foundational',
      score(state){
        const sleeves = ['stocks','bonds','reit','cash'].filter(k => (state.strategy.alloc[k]||0) > 0.02).length;
        const realAssets = state.properties.length + state.farmland.length;
        let s = 0;
        if (sleeves >= 3) s += 1;
        if (realAssets > 0 && state.age >= 30) s += 1;
        if ((state.strategy.alloc.stocks||0) > 0.95 && state.age > 55) s -= 1;
        return s;
      },
      guidance(state){
        if (state.age < 35) return "Equity-heavy is appropriate; add a real-asset sleeve when stable.";
        if (state.age < 55) return "Add bonds and real assets to weather any single regime.";
        return "Across-asset diversification matters more than ever near retirement.";
      }
    },
    {
      id: 'avoid-perm-loss',
      name: 'Avoid Permanent Loss of Capital',
      layer: 'foundational',
      score(state, d, log){
        let s = 0;
        // Cash buffer
        const cashMonths = state.accounts.cash.balance / Math.max(1000, state.spendBase/12);
        if (cashMonths >= 3) s += 1;
        if (cashMonths < 1 && state.age > 30) s -= 1;
        // Leverage: total property mortgage / property value
        let tv = 0, tm = 0;
        for (const p of state.properties){ tv += p.value; tm += p.mortgage; }
        if (tv > 0 && tm/tv > 0.85) s -= 1;
        // Selling equities into a crash
        if (log && log.marketReturn < -0.15 && state._priorAlloc &&
            state.strategy.alloc.stocks < (state._priorAlloc.stocks || 0) - 0.10){
          s -= 2;
          state.messages.push({ year: state.year, level: 'warn',
            msg: 'You sold equities into a major drawdown — historically a permanent loss trigger.' });
        }
        return s;
      },
      guidance(){ return "Cash buffer + sensible leverage + no panic selling."; }
    },
    {
      id: 'stay-the-course',
      name: 'Stay the Course',
      layer: 'foundational',
      score(state, d, log){
        if (!log) return 0;
        const prior = state._priorAlloc || state.strategy.alloc;
        const sold = state.strategy.alloc.stocks < (prior.stocks || 0) - 0.05;
        if (log.marketReturn < -0.15 && !sold) return +2;
        if (log.marketReturn < -0.30 && sold) return -3;
        return 0;
      },
      guidance(state){
        const last = state.history[state.history.length-1];
        if (last && last.marketReturn < -0.20)
          return "Major drawdown. History rewards holders; the worst 1y is often the best 5y entry.";
        return "Mechanical rebalancing > emotional reaction.";
      }
    },
    {
      id: 'tax-shelter',
      name: 'Tax-Advantaged Maximizer',
      layer: 'tax',
      score(state, d){
        const sheltered = (d.roth401k||0)+(d.trad401k||0)+(d.rothIRA||0)+(d.tradIRA||0)+(d.hsaContrib||0);
        const taxable = (d.taxable||0);
        if (!state.retired && sheltered > taxable*2 && sheltered > 5000) return +2;
        return 0;
      },
      guidance(){ return "Fill sheltered accounts before taxable: 401(k) match → HSA → IRA → 401(k) → taxable."; }
    },
    {
      id: 'real-asset',
      name: 'Real Asset Income Engine',
      layer: 'asset',
      score(state){
        if (state.properties.length + state.farmland.length > 0) return +1;
        return 0;
      },
      guidance(state){
        if (state.age < 30) return "House hacking (live-in rental) is a starter real-asset move.";
        if (state.age < 55) return "Long-term rentals or farmland add tax-advantaged income + diversification.";
        return "Real-asset cash flow stabilizes retirement income.";
      }
    },
    {
      id: 'leverage',
      name: 'Judicious Leverage',
      layer: 'asset',
      score(state){
        let tv = 0, tm = 0;
        for (const p of state.properties){ tv += p.value; tm += p.mortgage; }
        if (tv === 0) return 0;
        const ltv = tm / tv;
        if (ltv > 0 && ltv < 0.75) return +1;
        if (ltv > 0.85) return -1;
        return 0;
      },
      guidance(){ return "Long fixed-rate debt on cash-flowing assets — never on volatile paper."; }
    },
    {
      id: 'pre-tax-bridge',
      name: 'Pre-Tax Account Bridge (Roth Conversion Ladder)',
      layer: 'tax',
      score(state, d){
        if (!state.retired) return 0;
        if (state.age >= 60 && state.age < GAME.tax.rmdStartAge(state.birthYear) &&
            d.rothConvert && d.rothConvert > 5000) return +2;
        if (state.age >= GAME.tax.rmdStartAge(state.birthYear) &&
            (state.accounts.tradIRA.balance + state.accounts.trad401k.balance) > 750000) return -1;
        return 0;
      },
      guidance(state){
        if (state.retired && state.age < GAME.tax.rmdStartAge(state.birthYear))
          return "Gap-year Roth conversions to top of a chosen bracket reduce future RMDs.";
        return "";
      }
    },
    {
      id: 'sequence-shield',
      name: 'Sequence-of-Returns Shield',
      layer: 'retirement',
      score(state){
        if (!state.retired) return 0;
        const years = state.accounts.cash.balance / Math.max(1, state.spendBase);
        if (years >= 2 && years <= 6) return +1;
        if (years < 1) return -1;
        return 0;
      },
      guidance(){ return "Keep 2-5 years of spending in cash/short bonds before retirement."; }
    },
    {
      id: 'ss-optimizer',
      name: 'Social Security Longevity Optimizer',
      layer: 'retirement',
      score(state){
        if (!state.ssClaimed) return 0;
        if (state.ssClaimAge >= 70) return +2;
        if (state.ssClaimAge >= 67) return +1;
        if (state.ssClaimAge <= 62) return -1;
        return 0;
      },
      guidance(state){
        if (state.retired && !state.ssClaimed)
          return "Each year delayed past FRA = 8% larger inflation-adjusted benefit.";
        return "";
      }
    },
    {
      id: 'spending-curve',
      name: 'Retirement Spending Curve',
      layer: 'retirement',
      score(state){
        if (!state.retired) return 0;
        return state.strategy.spendingCurve !== 'flat' ? +1 : 0;
      },
      guidance(){ return "Most retirees spend more in the 'go-go' years, less in slow-go; plan curved."; }
    },
    {
      id: 'rebalance',
      name: 'Continuous Rebalancing',
      layer: 'foundational',
      score(state){ return state.strategy.rebalanceAnnually ? +1 : 0; },
      guidance(){ return "Annual rebalancing harvests volatility without prediction."; }
    },
    {
      id: 'circle-competence',
      name: 'Circle of Competence',
      layer: 'foundational',
      score(state){
        // If player owns property and has real-estate competence: +1
        const comp = state.opts.competence || [];
        let s = 0;
        if (state.properties.length > 0 && !comp.includes('real-estate')) s -= 1;
        if (state.business && !comp.includes('business')) s -= 1;
        return s;
      },
      guidance(){ return "Only invest actively where you have an edge; index the rest."; }
    },
    {
      id: 'legacy',
      name: 'Legacy and Step-Up Basis',
      layer: 'legacy',
      score(state){
        if (state.age < 70) return 0;
        const taxableGains = state.accounts.taxable.balance - state.accounts.taxable.basis;
        if (taxableGains > 250000) return +1;
        return 0;
      },
      guidance(){ return "Hold appreciated taxable assets to death for step-up basis (no LTCG to heirs)."; }
    },
    // ---------------- Newly added patterns ----------------
    {
      id: 'human-capital',
      name: 'Human Capital Maximizer',
      layer: 'foundational',
      score(state, d, log){
        if (state.retired || !log) return 0;
        // Compare this year's wage to last year's (history already contains
        // the current log), net of inflation. Rewards promotions/skill jumps.
        const n = state.history.length;
        const prev = n >= 2 ? state.history[n-2] : null;
        if (prev && prev.wages > 0 && log.wages > 0){
          const realGrowth = (log.wages - prev.wages) / prev.wages - Math.max(0, log.infl);
          if (realGrowth > 0.04) return +2;
          if (realGrowth > 0.02) return +1;
          if (realGrowth < -0.05) return -1;
        }
        return 0;
      },
      guidance(state){
        if (state.age < 35) return "Career growth is your largest asset early. Invest in skills, networks, and disability insurance.";
        return "Protect earning power: insurance, ongoing learning, network strength.";
      }
    },
    {
      id: 'behavioral-fortress',
      name: 'Behavioral Fortress (Written IPS)',
      layer: 'foundational',
      score(state, d, log){
        let s = 0;
        // Plus when player keeps a stable, written policy: rebalance on + curve set + no panic
        if (state.strategy.rebalanceAnnually) s += 1;
        if (state.retired && state.strategy.spendingCurve !== 'flat') s += 1;
        // Penalty when allocation changes radically year-over-year (whipsawing)
        const prior = state._priorAlloc;
        if (prior){
          const churn = Math.abs((prior.stocks||0) - (state.strategy.alloc.stocks||0))
                      + Math.abs((prior.bonds||0)  - (state.strategy.alloc.bonds||0))
                      + Math.abs((prior.cash||0)   - (state.strategy.alloc.cash||0));
          if (churn > 0.25) s -= 1;
        }
        return s;
      },
      guidance(){ return "Written policy + automation > improvisation. Same rules every year."; }
    },
    {
      id: 'inflation-protection',
      name: 'Inflation Protection Engine',
      layer: 'asset',
      score(state, d, log){
        if (!log) return 0;
        const realAssetWeight = (state.strategy.alloc.metals||0) + (state.strategy.alloc.reit||0);
        const ownsRealAsset = state.properties.length + state.farmland.length
                            + (state.primaryHome?1:0) + (state.secondaryHome?1:0) > 0;
        if (log.infl > 0.05){
          if (realAssetWeight + (ownsRealAsset ? 0.2 : 0) > 0.20) return +2;
          return -1;
        }
        return 0;
      },
      guidance(state){
        const last = state.history[state.history.length-1];
        if (last && last.infl > 0.05)
          return "High inflation regime. Real assets (homes, land, metals) protect purchasing power.";
        return "Hold a real-asset sleeve to hedge inflation seasons.";
      }
    },
    {
      id: 'precious-metals',
      name: 'Precious Metals Fortress',
      layer: 'asset',
      score(state){
        const m = state.strategy.alloc.metals || 0;
        if (m >= 0.05 && m <= 0.15) return +1;
        if (m > 0.30) return -1;
        return 0;
      },
      guidance(){ return "5-15% in physical/ETF gold + silver as insurance, not as a primary growth engine. Alabama exempts bullion sales tax."; }
    },
    {
      id: 'joseph-reserve',
      name: "Joseph's Cycle-Reserve",
      layer: 'asset',
      score(state, d, log){
        let s = 0;
        // Reward keeping a reserve >= 1 year of spending
        const reserveYears = state.reserveBucket / Math.max(1, state.spendBase);
        if (reserveYears >= 1) s += 1;
        if (log && log.marketReturn > 0.15 && state.strategy.josephReserveRate >= 0.10) s += 1;
        return s;
      },
      guidance(){ return "Reserve 15-25% during 'plenty' years; deploy during corrections. Avoid forced selling."; }
    },
    {
      id: 'cycle-rhythm',
      name: 'Cycle Rhythm Navigator',
      layer: 'asset',
      score(state, d, log){
        if (!log) return 0;
        if (log.marketReturn < -0.10 && state.strategy.cycleRhythmDeploy) return +2;
        return 0;
      },
      guidance(){ return "10% corrections come every ~2 years, 20% bears every ~5. Plan to BUY into them, not sell."; }
    },
    {
      id: 'nehemiah-rebuild',
      name: "Nehemiah's Focused Rebuild",
      layer: 'asset',
      score(state, d, log){
        // Reward sustained execution: same major project (business / property / home flip) without abandoning
        if (state.business && (state.year - (state.business.started || state.year)) >= 3) return +1;
        if (state.primaryHome && (state.year - state.primaryHome.yearAcquired) === 3 && state.lastSec121Year === null) {
          // Three-year tenure with §121-ready primary
          return +1;
        }
        return 0;
      },
      guidance(){ return "Big builds (business, home flip, portfolio overhaul) win through focused, dual-purpose work — build AND defend simultaneously."; }
    },
    {
      id: 'residence-dual-use',
      name: 'Residence as Dual-Use Capital',
      layer: 'asset',
      score(state){
        let s = 0;
        if (state.primaryHome){
          const ltv = state.primaryHome.mortgage / Math.max(1, state.primaryHome.value);
          if (ltv < 0.80) s += 1;
          // Penalty if home > 50% of net worth
          const nw = (function(){ let n=0; for (const k in state.accounts) n+=state.accounts[k].balance;
                                   if (state.primaryHome) n += state.primaryHome.value - state.primaryHome.mortgage; return n; })();
          if (state.primaryHome.value > nw * 0.60 && state.age > 40) s -= 1;
        }
        if (state.secondaryHome){
          // Secondary penalized unless used as STR or > age 50
          if (state.age < 50 && state.properties.length === 0) s -= 1;
        }
        return s;
      },
      guidance(state){
        if (!state.primaryHome) return "House-hacking (live-in rental) is the highest-leverage starter move.";
        if (state.primaryHome.mortgage / state.primaryHome.value > 0.85)
          return "Heavy primary leverage; ensure 6+ months reserves.";
        return "Primary home is forced savings + inflation hedge; keep it < 30% gross income.";
      }
    },
    {
      id: 'serial-harvester',
      name: 'Serial Primary Residence Harvester (§121)',
      layer: 'tax',
      score(state){
        const events = state.sec121Events || [];
        if (events.length === 0) return 0;
        // Reward each successful §121 sale with significant exclusion
        const recent = events[events.length-1];
        if (recent.year === state.year - 1 && recent.excluded > 50000) return +2;
        // Penalty for too-frequent attempts (dealer risk)
        if (events.length >= 4 && state.age < 55) return -1;
        return 0;
      },
      guidance(state){
        if (!state.primaryHome) return "";
        const yearsOwned = state.year - state.primaryHome.yearAcquired;
        if (yearsOwned >= 2) return `Eligible for §121: up to $${(GAME.tax.SEC121_LIMIT[state.opts.status]/1000)}k tax-free gain on sale.`;
        return `Hold for ${2-yearsOwned} more year(s) to qualify for §121 exclusion.`;
      }
    },
    {
      id: 'charitable-multiplier',
      name: 'Charitable Multiplier',
      layer: 'tax',
      score(state, d){
        const giving = (d && (d.charitable||0) + (d.qcd||0)) || 0;
        if (giving > 0 && state.wages > 0 && giving > state.wages * 0.05) return +1;
        if (state.age >= 70 && d && d.qcd > 5000) return +2;
        return 0;
      },
      guidance(state){
        if (state.age >= 70) return "QCDs (up to $108k) from IRA satisfy RMDs without income tax.";
        return "Charitable giving from appreciated taxable assets or DAF beats cash for tax efficiency.";
      }
    },
    {
      id: 'biblical-stewardship',
      name: 'Biblical Stewardship (Meta-Pattern)',
      layer: 'foundational',
      score(state, d, log){
        // Composite of diligence, prudence, diversification, generosity
        let s = 0;
        // Diligence: positive savings rate or generous reserve
        if (!state.retired){
          const tot = (d.roth401k||0)+(d.trad401k||0)+(d.rothIRA||0)+(d.tradIRA||0)+(d.taxable||0);
          if (tot > state.wages * 0.12) s += 1;
        }
        // Diversification: at least 3 asset sleeves
        const sleeves = ['stocks','bonds','reit','metals','cash'].filter(k => (state.strategy.alloc[k]||0) > 0.02).length;
        if (sleeves >= 4) s += 1;
        // Prudence: cash reserve adequate
        if (state.accounts.cash.balance + state.reserveBucket > state.spendBase * 0.5) s += 1;
        // Generosity: any giving this year
        if (d && (d.charitable||0) + (d.qcd||0) > 0) s += 1;
        return s > 0 ? Math.min(s, 2) : 0;
      },
      guidance(){ return "Diligence + Prudence + Diversification + Generosity. The four legs of stewardship."; }
    }
  ];

  function score(state, decisions, log, r){
    for (const p of PATTERNS){
      let delta = 0;
      try { delta = p.score(state, decisions || {}, log, r) || 0; }
      catch(e){ delta = 0; }
      if (delta !== 0){
        const bucket = delta > 0 ? state.patternScore.activated : state.patternScore.violated;
        bucket[p.id] = (bucket[p.id] || 0) + Math.abs(delta);
      }
    }
  }

  function guidance(state){
    const out = [];
    for (const p of PATTERNS){
      const g = p.guidance ? p.guidance(state) : '';
      if (g) out.push({ id: p.id, name: p.name, msg: g, layer: p.layer });
    }
    return out;
  }
  function totals(state){
    let plus = 0, minus = 0;
    for (const k in state.patternScore.activated) plus += state.patternScore.activated[k];
    for (const k in state.patternScore.violated)  minus += state.patternScore.violated[k];
    return { plus, minus, net: plus - minus };
  }
  function topPatterns(state, n){
    n = n || 5;
    const a = Object.entries(state.patternScore.activated).sort((x,y)=>y[1]-x[1]).slice(0,n);
    const v = Object.entries(state.patternScore.violated).sort((x,y)=>y[1]-x[1]).slice(0,n);
    return { activated: a, violated: v };
  }
  function info(id){ return PATTERNS.find(p => p.id === id); }
  return { PATTERNS, score, guidance, totals, topPatterns, info };
})();
