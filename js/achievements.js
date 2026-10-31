/*
 * Achievement + milestone system. Each year, the engine state is scanned
 * against a list of trigger rules. New unlocks pop a toast (and can show
 * a milestone modal for the big ones). Already-unlocked achievements are
 * stored on state.achievements.
 */
window.GAME = window.GAME || {};
GAME.achievements = (function () {

  const ACHIEVEMENTS = [
    // --- Wealth milestones ---
    { id: 'nw-100k', name: 'First $100k',  big: true,
      check: s => s.history.at(-1)?.netWorth >= 100000,
      msg: 'You crossed $100k net worth. Charlie Munger called this the hardest threshold to cross.' },
    { id: 'nw-1m',   name: 'Millionaire',  big: true,
      check: s => s.history.at(-1)?.netWorth >= 1000000,
      msg: 'Net worth has crossed seven figures. The compounding curve gets visibly steeper from here.' },
    { id: 'nw-10m',  name: 'Decamillionaire', big: true,
      check: s => s.history.at(-1)?.netWorth >= 10000000,
      msg: 'Eight figures. You are now in the top ~1% of US households.' },
    { id: 'nw-100m', name: 'Nine-Figure Net Worth', big: true,
      check: s => s.history.at(-1)?.netWorth >= 100000000,
      msg: 'A century-class fortune. Real returns over a full lifetime can do this.' },

    // --- Behavioral / pattern ---
    { id: 'bought-the-dip', name: 'Bought the Dip',
      check: s => s.messages.some(m => m.year === s.year - 1 && /Cycle Rhythm:/.test(m.msg)),
      msg: 'You deployed reserves into a major correction — exactly what Joseph + Cycle Rhythm prescribe.' },
    { id: 'held-the-storm', name: 'Held Through the Storm',
      check: s => {
        const last = s.history.at(-1);
        const prior = s._priorAlloc;
        return last && last.marketReturn < -0.25 && prior &&
               Math.abs((prior.stocks||0) - (s.strategy.alloc.stocks||0)) < 0.02;
      },
      msg: 'A -25% year and you did not flinch. The hardest pattern of all.' },
    { id: 'first-roth',  name: 'First Roth Contribution',
      check: s => (s.accounts.rothIRA.balance + s.accounts.roth401k.balance) > 0 &&
                  !s.achievements?.has('first-roth'),
      msg: 'Tax-free compounding has begun.' },
    { id: 'max-401k',    name: 'Maxed the 401(k)',
      check: s => {
        const lim = s.age >= 50 ? 31000 : 23500;
        const last = s.history.at(-1);
        return last && ((last._d_roth401k||0) + (last._d_trad401k||0)) >= lim - 100;
      },
      msg: 'You hit the federal 401(k) limit. Tax-advantaged maximizer activated.' },

    // --- Real assets / business ---
    { id: 'first-rental', name: 'First Rental',
      check: s => s.properties.length >= 1,
      msg: 'Real-asset income engine started. Depreciation + leverage + cash flow.' },
    { id: 'first-home',   name: 'First Home',
      check: s => !!s.primaryHome,
      msg: 'Primary residence acquired. Forced savings + §121 tax exclusion eligibility in 2 years.' },
    { id: 'section-121',  name: '§121 Tax-Free Sale',
      check: s => (s.sec121Events||[]).length >= 1,
      msg: 'You harvested a tax-free capital gain on your primary home. Up to $500k MFJ / $250k single, repeatable every 2 years.' },
    { id: 'serial-3',     name: 'Serial Harvester (3 sales)',
      check: s => (s.sec121Events||[]).length >= 3,
      msg: 'Three §121 cycles. The "slow flip" tax arbitrage in action.' },
    { id: 'business-3yr', name: 'Three-Year Business',
      check: s => s.business && (s.year - (s.business.started||s.year)) >= 3,
      msg: 'Three years operating your own business. Nehemiah focus pattern in motion.' },

    // --- Tax/retirement ---
    { id: 'roth-conv-50', name: 'Roth Conversion Ladder',
      check: s => {
        const lastYrConv = s.history.filter(h => h._rothConv > 0).length;
        return lastYrConv >= 3;
      },
      msg: 'Three years of Roth conversions in gap-year windows. RMDs will be smaller for it.' },
    { id: 'ss-delayed-70', name: 'Delayed SS to 70',
      check: s => s.ssClaimAge && s.ssClaimAge >= 70,
      msg: 'You took the 8%/year delay credits to the max. Risk-free 24-32% benefit boost.' },
    { id: 'qcd',           name: 'First QCD',
      check: s => s.history.some(h => (h.charitable||0) > 0 && h.age >= 70),
      msg: 'Qualified Charitable Distribution from your IRA — RMD satisfied without taxable income.' },

    // --- Stewardship ---
    { id: 'joseph-bucket', name: 'Filled the Granary',
      check: s => s.reserveBucket >= s.spendBase,
      msg: '≥1 year of spending stored as Joseph reserve. Famine-ready.' },
    { id: 'generous-decade', name: 'Generous Decade',
      check: s => s.lifetimeCharity >= 50000,
      msg: '$50k cumulative giving. Generosity is the fourth leg of stewardship.' },
    { id: 'pattern-500',   name: 'Pattern Net +500',
      check: s => GAME.patterns.totals(s).net >= 500,
      msg: 'Your pattern-adherence score crossed 500. You play like a disciplined high performer.' },

    // --- Crashes survived ---
    { id: 'survived-bear', name: 'Survived a Bear',
      check: s => s.history.some(h => h.marketReturn < -0.20),
      msg: 'You lived through a 20%+ drawdown. The market always recovers; the patient compound through it.' },
    { id: 'survived-2008', name: 'Survived 2008',
      check: s => s.history.some(h => h.ey === 2008 && h.marketReturn < -0.30),
      msg: 'You held through the Global Financial Crisis. The next decade was one of the strongest on record.' },
    { id: 'survived-29',   name: 'Survived the Crash of 1929',
      check: s => s.history.some(h => h.ey === 1932 && h.marketReturn < -0.05) &&
                  s.history.some(h => h.ey === 1929 && h.marketReturn < -0.05),
      msg: 'You navigated the worst peacetime drawdown in modern market history. Most did not.' },

    // --- Life completion ---
    { id: 'retired-65',    name: 'Retired by 65',
      check: s => s.retired && s.retiredAt <= 65,
      msg: 'Right on schedule. Average US retirement age is 63-65.' },
    { id: 'retired-55',    name: 'Retired by 55 (FIRE)',
      check: s => s.retired && s.retiredAt <= 55,
      msg: 'Financial independence achieved by 55. A high savings rate compounding through a long bull always works.' },
    { id: 'lasted-90',     name: 'Lasted to 90 with money',
      check: s => s.age >= 90 && s.history.at(-1)?.netWorth > 0,
      msg: 'You did not outlive your money. Sequence shield + curved spending pays off.' }
  ];

  function init(state) {
    state.achievements = new Set();
    state.newAchievements = []; // queue for UI to pop
  }

  function check(state) {
    if (!state.achievements) init(state);
    for (const a of ACHIEVEMENTS) {
      if (state.achievements.has(a.id)) continue;
      try {
        if (a.check(state)) {
          state.achievements.add(a.id);
          state.newAchievements.push(a);
        }
      } catch (e) { /* swallow */ }
    }
  }

  function popNew(state) {
    if (!state.newAchievements) return [];
    const popped = state.newAchievements.slice();
    state.newAchievements = [];
    return popped;
  }

  function list(state) {
    return ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: state.achievements ? state.achievements.has(a.id) : false
    }));
  }

  // Composite "Stewardship Score" — single live number representing player quality.
  // Range roughly 0-1000 over a full life.
  function stewardshipScore(state) {
    if (!state.history.length) return 0;
    const patternNet = GAME.patterns.totals(state).net;       // up to ~700
    const achievementBonus = (state.achievements?.size || 0) * 15;
    // Survivability: positive NW + funded spending
    const last = state.history.at(-1);
    const survivalBonus = last && last.netWorth > 0 ? 100 : 0;
    // Inflation-adjusted final NW relative to peers' baseline
    const realNW = last ? last.netWorth / Math.pow(1.03, state.history.length) : 0;
    const wealthBonus = Math.min(200, realNW / 50000);        // up to +200 at $10M real
    // Penalize cash shortfall events
    const shortfallPenalty = state.cashShortfall ? 150 : 0;
    return Math.max(0, Math.round(patternNet + achievementBonus + survivalBonus + wealthBonus - shortfallPenalty));
  }

  return { ACHIEVEMENTS, init, check, popNew, list, stewardshipScore };
})();
