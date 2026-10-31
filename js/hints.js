/*
 * Hint system: per-field explanations available on hover (always) and
 * shown as inline captions when "Hints" mode is on.
 *
 * Add new entries here. The lookup key is the element ID.
 */
window.GAME = window.GAME || {};
GAME.hints = (function () {
  const T = {
    // --- Setup ---
    'opt-age': 'Your starting age. The lower it is, the more compounding time you have. Range 18-70.',
    'opt-wages': 'Annual gross wages in starting-year dollars. Will grow by wage-growth + inflation each year.',
    'opt-wagegrow': 'Real wage growth above inflation. Economy-wide average is about 1%/yr (SSA Average Wage Index); promotions arrive on top as life events. The engine adds CPI automatically.',
    'opt-spend': 'Annual baseline spending in starting-year dollars. Inflates yearly. Drives how much you need at retirement.',
    'opt-status': 'Filing status. MFJ doubles brackets and the §121 home-sale exclusion ($500k vs $250k).',
    'opt-state': 'State of residence. Alabama is uniquely advantaged: no state tax on SS or most retirement income, bullion exempt.',
    'opt-histmode': 'How the market unfolds. "Random historical" is the most realistic and educational — you live through actual market history starting at a randomly chosen year.',
    'opt-competence': 'Areas where you have an edge. The engine penalizes owning assets outside your competence. Pick 1-3 honestly.',
    'opt-seed': 'Set the same number to reproduce a life exactly (great for comparing strategies). Leave blank for a fresh run.',
    'opt-scenario': 'A pre-set challenge. Each forces specific starting conditions and historical era to teach a particular lesson.',

    // --- Contributions ---
    'd-roth401k': '2026 employee limit: $23,500 ($31,000 if 50+). Post-tax in, tax-free growth and withdrawal after 59½. No RMDs (Roth IRA). Best when current bracket ≤ future bracket.',
    'd-trad401k': '2026 employee limit: $23,500 ($31,000 if 50+). Pre-tax (reduces taxable wages now), taxed as ordinary income at withdrawal. RMDs start at 73 or 75.',
    'd-rothIRA':  '2026 IRA limit: $7,500 ($8,500 if 50+). Backdoor available at high incomes. Same tax-free benefit as Roth 401(k) but with broader investment options.',
    'd-tradIRA':  '2026 IRA limit: $7,500 ($8,500 if 50+). Deductible if income/coverage rules met. Same RMD/tax characteristics as Trad 401(k).',
    'd-hsa':      '2026 HSA limit: $4,300 individual. Triple-tax-advantaged when used for medical. After 65, non-medical withdrawals taxed as ordinary income (like Trad IRA).',
    'd-taxable':  'Taxable brokerage. No deduction now, but qualified dividends and LTCG are taxed at 0/15/20%. Step-up basis at death is the legacy superpower.',

    // --- Allocation ---
    'a-stocks': 'Equity sleeve (S&P 500 total return). Long-term ~10% nominal but with 50%+ drawdowns. The growth engine.',
    'a-bonds':  '10-year Treasury sleeve. Long-term ~4.5%. Stability and income, but volatile in inflation shocks (e.g., 2022).',
    'a-cash':   'T-bill / money-market sleeve. Long-term ~3.3%. Liquidity, not growth. Should match your near-term spending needs.',
    'a-reit':   'Real-estate investment trust sleeve. Synthetic mix of equity + housing factors. Adds yield + inflation hedge.',
    'a-metals': 'Physical gold/silver sleeve. Long-term ~5-6% nominal, mostly post-1971. Crisis insurance. Taxed as collectibles (28% federal LTCG); Alabama exempts bullion sales tax.',

    // --- Stewardship ---
    'd-cashtarget': 'Months of spending deliberately held as cash. Cash above this target is unassigned — roughly half of it drifts into lifestyle spending each year. Raise the target when saving toward a down payment; money you assign is money you keep.',
    'd-joseph': 'Joseph reserve rate: 0-25% of excess cash diverted to a reserve bucket during years where stocks were positive ("plenty"). Stored at T-bill.',
    'd-charity': 'Charitable giving this year in dollars. Deductible if you itemize. The Biblical Stewardship pattern rewards generosity.',
    'd-qcd': 'Qualified Charitable Distribution from your IRA, age 70.5+. Up to $108k/yr satisfies RMD without creating taxable income.',
    'd-cycle': 'When enabled, the engine auto-deploys 50% of your reserve into the taxable equity sleeve after any year that lost more than 15%. The classic "buy the dip with dry powder" rule.',
    'd-curve': 'Retirement spending pattern. Smile = +15% first decade ("go-go years"), dip in slow-go, modest rise late. Empirically the most common real pattern.',
    'd-rothconv': 'Roth conversion dollars this year. Moves Trad → Roth, taxed as ordinary income now. Best executed in low-bracket "gap" years (retired, pre-SS, pre-RMD).',

    // --- Major moves ---
    'btn-buy-home':      'Buy primary residence ($280k, 20% down = $56k). Forced savings + inflation hedge. Hold 2+ years to qualify for §121 tax-free gain on sale.',
    'btn-improve-home':  'Capital improvement ($30k → +$45k value, +$30k basis). Raises basis, reducing taxable gain on future sale. Real renovations only — repairs do not count.',
    'btn-sell-home':     'Sell primary residence. If owned and lived in 2+ of last 5 years, up to $250k single / $500k MFJ of gain is tax-free under IRC §121. Eligible every 2 years.',
    'btn-buy-secondary': 'Buy vacation/second home ($350k, 25% down). NO §121 benefit. Often a lifestyle drag unless run as STR. Best after core engines are strong.',
    'btn-buy-prop':      'Buy long-term rental ($150k, 25% down). Generates cash flow + depreciation + appreciation. Most powerful real-asset pattern.',
    'btn-buy-str':       'Buy short-term rental / Airbnb ($250k, 25% down). Higher yield potential, higher operating costs, possible self-employment tax.',
    'btn-buy-farm':      'Buy farmland ($80k cash). Low volatility, inflation hedge, ~3% cash rent yield, low correlation to equities.',
    'btn-start-biz':     'Start a small business ($50k). High variance — N(10%, 30%) annual growth with 4% major-loss risk. Highest upside if you have edge.',

    // --- Major actions ---
    'btn-advance':       'Run one year of simulation using whatever you have in the inputs. Returns, taxes, life events, and pattern scoring all resolve.',
    'btn-advance-5':     'Run 5 years on autopilot (uses pattern-language suggested decisions).',
    'btn-advance-to-65': 'Run autopilot until age 65 or you die. Useful for the working-years grind.',
    'btn-retire':        'Trigger retirement. Wages stop, withdrawal logic activates, retirement decision panel appears.',
    'btn-claim-ss':      'Claim Social Security now. Each year delayed past 67 (FRA) adds 8% to your benefit until 70.',
    'btn-suggest':       'Refill the contribution and allocation inputs with the pattern-language suggestion for your current age and state.',
    'btn-toggle-patterns':'Collapse or expand the pattern guidance panel.',
    'btn-hints':         'Toggle inline explanatory captions for every input and button.',
    'btn-restart':       'Throw away this life and return to the setup screen.'
  };

  let hintsOn = false;

  function attachAll() {
    Object.keys(T).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.title = T[id];                              // native browser tooltip always on
      el.setAttribute('data-tip', T[id]);
      // For inputs, attach an inline caption label below when hints mode on
      if (hintsOn) showInlineCaption(el, T[id]);
    });
  }

  function showInlineCaption(el, text) {
    // Don't add if already added
    if (el.parentElement.querySelector('.inline-hint')) return;
    const cap = document.createElement('div');
    cap.className = 'inline-hint';
    cap.textContent = text;
    if (el.tagName === 'BUTTON') el.after(cap);
    else el.parentElement.appendChild(cap);
  }

  function clearInlineCaptions() {
    document.querySelectorAll('.inline-hint').forEach(e => e.remove());
  }

  function setHints(on) {
    hintsOn = !!on;
    document.body.classList.toggle('hints-on', hintsOn);
    if (!hintsOn) clearInlineCaptions();
    attachAll();
  }
  function isOn(){ return hintsOn; }
  function describe(id){ return T[id] || null; }

  return { attachAll, setHints, isOn, describe };
})();
