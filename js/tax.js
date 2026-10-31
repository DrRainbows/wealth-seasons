/*
 * Tax engine. Produces federal + AL state tax for a year given:
 *   - filing status, age, wages, interest, qualified dividends, ordinary dividends,
 *     short-term gains, long-term gains, IRA/401k withdrawals (ordinary),
 *     Roth conversions (ordinary), Social Security gross,
 *     business net income (Schedule C / QBI eligible),
 *     rental net income (passive after depreciation), HSA contributions, retirement contributions.
 *
 * Uses 2026 brackets (inflation-adjusted estimates). Alabama exempts SS and
 * most retirement distributions from state income tax.
 *
 * All math returns a result object so the UI can show line items.
 */
window.GAME = window.GAME || {};
GAME.tax = (function () {

  // ---- 2026 federal ordinary income brackets (estimated) ----
  const BR_SINGLE = [
    [0,        0.10],
    [12200,    0.12],
    [49600,    0.22],
    [105700,   0.24],
    [201700,   0.32],
    [256225,   0.35],
    [640550,   0.37]
  ];
  const BR_MFJ = [
    [0,        0.10],
    [24400,    0.12],
    [99200,    0.22],
    [211400,   0.24],
    [403400,   0.32],
    [512450,   0.35],
    [768950,   0.37]
  ];
  // Long-term capital gains / qualified dividend brackets (2026 est.)
  const LTCG_SINGLE = [
    [0,        0.00],
    [49000,    0.15],
    [533000,   0.20]
  ];
  const LTCG_MFJ = [
    [0,        0.00],
    [98000,    0.15],
    [600000,   0.20]
  ];
  // Net Investment Income Tax threshold (MAGI)
  const NIIT_THRESHOLD = { single: 200000, mfj: 250000 };
  // Standard deduction 2026 (estimated with usual indexing)
  const STD_DED = { single: 15800, mfj: 31600 };
  // Senior bonus (65+) standard deduction increment
  const SENIOR_BONUS = { single: 2050, mfj: 1650 };
  // SS taxation thresholds (1983 statute, NOT indexed)
  const SS_BASE = { single: 25000, mfj: 32000 };
  const SS_TIER2 = { single: 34000, mfj: 44000 };
  // IRMAA 2026 (estimated). Married thresholds shown; single ~ half.
  const IRMAA_MFJ = [
    [0,        0],     // tier 1: no surcharge
    [212000,   840],   // ~70/mo Part B surcharge annualized
    [266000,   2100],
    [332000,   3360],
    [398000,   4620],
    [750000,   5040]
  ];
  const IRMAA_SINGLE = [
    [0,        0],
    [106000,   840],
    [133000,   2100],
    [167000,   3360],
    [200000,   4620],
    [500000,   5040]
  ];
  // Alabama: 2%/4%/5% brackets, retirement income largely exempt
  const AL_BR_SINGLE = [[0,0.02],[500,0.04],[3000,0.05]];
  const AL_BR_MFJ    = [[0,0.02],[1000,0.04],[6000,0.05]];
  const AL_STD = { single: 3000, mfj: 8500 };
  // Section 121 primary-residence capital gains exclusion
  const SEC121_LIMIT = { single: 250000, mfj: 500000 };
  const SEC121_LOOKBACK = 2;       // years between qualifying sales
  // Collectibles long-term capital gains rate (physical metals, art, etc.)
  const COLLECTIBLES_RATE = 0.28;
  // QCD annual maximum (IRA charitable rollover, age 70.5+)
  const QCD_MAX = 108000;          // 2026 estimate
  // Standard mortgage interest cap (acquisition debt)
  const MORTGAGE_INT_CAP_DEBT = 750000;
  // SALT cap (state + local + property tax itemized)
  const SALT_CAP = 10000;
  // Uniform Lifetime Table divisors (age -> divisor). Sample of common ages.
  const RMD_TABLE = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
    87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
    94:  9.5, 95:  8.9, 96:  8.4, 97:  7.8, 98:  7.3, 99:  6.8, 100: 6.4,
    101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6
  };
  // RMD start age depends on birth year. We accept "75 cohort" simply via flag.
  function rmdStartAge(birthYear){
    if (birthYear >= 1960) return 75;
    if (birthYear >= 1951) return 73;
    return 72; // earlier cohort
  }
  function rmdDivisor(age){ return RMD_TABLE[age] || (age > 105 ? 4.6 : null); }

  // Apply progressive bracket schedule to a positive income amount.
  function bracketTax(income, brackets){
    if (income <= 0) return 0;
    let tax = 0;
    for (let i = 0; i < brackets.length; i++){
      const lo = brackets[i][0];
      const hi = (i+1 < brackets.length) ? brackets[i+1][0] : Infinity;
      const rate = brackets[i][1];
      if (income <= lo) break;
      const taxableInBand = Math.min(income, hi) - lo;
      tax += taxableInBand * rate;
    }
    return tax;
  }

  // Compute LTCG tax stacked on top of ordinary income.
  function ltcgTax(ordinary, ltcg, status){
    if (ltcg <= 0) return 0;
    const tbl = status === 'mfj' ? LTCG_MFJ : LTCG_SINGLE;
    let remaining = ltcg, tax = 0;
    let baseFloor = Math.max(ordinary, 0);
    for (let i = 0; i < tbl.length && remaining > 0; i++){
      const lo = tbl[i][0];
      const hi = (i+1 < tbl.length) ? tbl[i+1][0] : Infinity;
      const rate = tbl[i][1];
      const bandTop = hi;
      const taxableHere = Math.max(0, Math.min(baseFloor + remaining, bandTop) - Math.max(baseFloor, lo));
      if (taxableHere > 0){
        tax += taxableHere * rate;
        baseFloor += taxableHere;
        remaining -= taxableHere;
      }
    }
    return tax;
  }

  // Provisional income for SS taxation
  function ssTaxable(ssGross, otherIncome, status){
    if (ssGross <= 0) return 0;
    const prov = otherIncome + 0.5 * ssGross;
    const base = SS_BASE[status], t2 = SS_TIER2[status];
    if (prov <= base) return 0;
    if (prov <= t2)   return Math.min(0.5 * (prov - base), 0.5 * ssGross);
    const tier1 = Math.min(0.5 * (t2 - base), 0.5 * ssGross);
    const tier2 = 0.85 * (prov - t2);
    return Math.min(tier1 + tier2, 0.85 * ssGross);
  }

  // IRMAA Medicare Part B + D surcharge lookup based on MAGI two years prior
  function irmaa(magi, status){
    const tbl = status === 'mfj' ? IRMAA_MFJ : IRMAA_SINGLE;
    let surcharge = 0;
    for (const [thresh, amt] of tbl) if (magi >= thresh) surcharge = amt;
    return surcharge;
  }

  // Section 121 sale: returns excluded gain (free) and taxable gain (subject to LTCG).
  // gain: realized gain on home sale; lastSec121Year: last year a 121 sale was claimed.
  function section121(gain, status, currentYear, lastSec121Year){
    if (gain <= 0) return { excluded: 0, taxable: 0, allowed: false };
    if (lastSec121Year != null && (currentYear - lastSec121Year) < SEC121_LOOKBACK)
      return { excluded: 0, taxable: gain, allowed: false };
    const limit = SEC121_LIMIT[status];
    const excluded = Math.min(gain, limit);
    return { excluded, taxable: Math.max(0, gain - limit), allowed: true };
  }

  // QCD: Reduces taxable RMD. Returns the QCD amount actually applied (≤ QCD_MAX, ≤ RMD).
  function qcdOffset(ageAtYearEnd, rmd, requestedQCD){
    if (ageAtYearEnd < 70 || rmd <= 0 || requestedQCD <= 0) return 0;
    return Math.min(requestedQCD, rmd, QCD_MAX);
  }

  // ---- Main calculator ----
  // inputs: {status, age, ageSpouse, wages, interest, qualDiv, ordDiv,
  //          stcg, ltcg, ltcgCollect, iraWithdraw, rothConvert, ssGross, businessNet,
  //          rentalNet, hsaContrib, k401Contrib, tradIRAContrib, charitable, qcd,
  //          itemizedExtra}
  // Returns: {fed, state, irmaa, ssTaxableAmt, agi, taxableInc, magi,
  //           niit, effRate, marginalBand}
  function calc(inp){
    const s = inp.status || 'single';
    const status = s;
    const seniorOne = inp.age >= 65;
    const seniorTwo = status === 'mfj' && inp.ageSpouse >= 65;
    const stdBase = STD_DED[status];
    const stdBonus = (seniorOne ? SENIOR_BONUS[status] : 0)
                   + (seniorTwo ? SENIOR_BONUS[status] : 0);
    const stdDed = stdBase + stdBonus;

    // Pre-tax 401k already removed from W-2 box 1; HSA and (deductible) Trad IRA are above-the-line.
    const wages = Math.max(0, (inp.wages||0) - (inp.k401Contrib||0));
    const aboveLine = (inp.tradIRAContrib||0) + (inp.hsaContrib||0);

    // QCD reduces the taxable portion of the IRA withdrawal (but does not reduce RMD count).
    const iraWithdrawNet = Math.max(0, (inp.iraWithdraw||0) - (inp.qcd||0));

    const ordOther = (inp.interest||0) + (inp.ordDiv||0) + (inp.stcg||0)
                   + iraWithdrawNet + (inp.rothConvert||0)
                   + (inp.businessNet||0) + (inp.rentalNet||0);

    // SS taxable portion uses combined ordinary + half-SS
    const ssTax = ssTaxable(inp.ssGross||0,
                            wages + ordOther + (inp.qualDiv||0) + (inp.ltcg||0),
                            status);

    const ordinaryGross = wages + ordOther + ssTax;
    const ordinary = Math.max(0, ordinaryGross - aboveLine);   // for bracket math
    const agi = ordinary + (inp.qualDiv||0) + (inp.ltcg||0);
    const magi = agi;

    // Itemized: charitable + mortgage interest + SALT (capped) + extra (e.g., medical)
    const itemized = (inp.charitable||0)
                   + Math.min(inp.mortgageInterest||0, MORTGAGE_INT_CAP_DEBT * 0.07)
                   + Math.min((inp.propertyTax||0)+(inp.stateIncomeTaxPaid||0), SALT_CAP)
                   + (inp.itemizedExtra||0);
    const dedUsed = Math.max(stdDed, itemized);
    const taxableOrdinary = Math.max(0, ordinary - dedUsed);
    const fedOrd = bracketTax(taxableOrdinary, status === 'mfj' ? BR_MFJ : BR_SINGLE);
    // Standard LTCG (qualDiv + regular ltcg) + collectibles at 28% (gold/silver, etc.)
    const fedCG  = ltcgTax(taxableOrdinary, (inp.qualDiv||0) + (inp.ltcg||0), status)
                 + Math.max(0, inp.ltcgCollect||0) * COLLECTIBLES_RATE;

    // NIIT: 3.8% on lesser of net investment income or MAGI over threshold
    const investmentIncome = (inp.interest||0) + (inp.ordDiv||0) + (inp.qualDiv||0)
                           + (inp.ltcg||0) + (inp.stcg||0) + Math.max(0, inp.rentalNet||0);
    const niit = Math.min(investmentIncome,
                          Math.max(0, magi - NIIT_THRESHOLD[status])) * 0.038;

    const fed = fedOrd + fedCG + niit;

    // QBI deduction simplification: 20% of business + rental net, limited by taxable income
    const qbi = Math.max(0, 0.20 * Math.max(0,(inp.businessNet||0)+(inp.rentalNet||0)));
    const fedAdj = Math.max(0, fed - qbi * 0.22); // rough offset
    // Alabama state tax. Exempt: SS, IRA/401k withdraws (mostly), military pensions.
    const alOrdinary = Math.max(0, wages + (inp.interest||0) + (inp.ordDiv||0)
                       + (inp.stcg||0) + (inp.businessNet||0) + (inp.rentalNet||0)
                       + (inp.qualDiv||0) + (inp.ltcg||0)
                       - AL_STD[status]);
    const stateTax = bracketTax(alOrdinary, status === 'mfj' ? AL_BR_MFJ : AL_BR_SINGLE);

    // IRMAA only matters at 65+ (Medicare)
    const irmaaCost = inp.age >= 65 ? irmaa(magi, status) : 0;

    return {
      fed: fedAdj, state: stateTax, irmaa: irmaaCost, niit,
      ssTaxableAmt: ssTax, agi, magi,
      taxableInc: taxableOrdinary,
      dedUsed,
      effRate: ordinary > 0 ? (fedAdj+stateTax+irmaaCost)/Math.max(1,ordinary+(inp.qualDiv||0)+(inp.ltcg||0)) : 0
    };
  }

  // FICA / payroll on wages (employee side)
  function fica(wages, status){
    const ss = Math.min(wages, 176100) * 0.062; // 2026 SS wage base est.
    const med = wages * 0.0145
              + Math.max(0, wages - (status === 'mfj' ? 250000 : 200000)) * 0.009;
    return ss + med;
  }

  return {
    calc, fica, ssTaxable, irmaa, bracketTax,
    rmdDivisor, rmdStartAge,
    section121, qcdOffset,
    BR_SINGLE, BR_MFJ, LTCG_SINGLE, LTCG_MFJ, STD_DED,
    SEC121_LIMIT, COLLECTIBLES_RATE, QCD_MAX
  };
})();
