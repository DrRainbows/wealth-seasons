# Wealth Seasons — Player's Manual

> A lifetime investment **game**, built from a pattern language of 100+ years of investing evidence. Not advice. Not a forecast. A teaching instrument with score, achievements, and scenarios.

## What makes it a game (not just a calculator)

- **A single number to chase**: the **Stewardship Score** (live in the status bar). Composed of pattern adherence + achievements + survival + inflation-adjusted final wealth.
- **Two ghosts live your life beside you**: from year one, two companion simulations tick through the *identical* world — same market years, same promotions, layoffs, children, health shocks, same lifespan. One follows published mainstream-average behavior; one follows the pattern language. Their lines are on your chart the whole game. At the end you see all three lives side by side, to the dollar.
- **Scenarios**: 7 pre-set challenges with explicit goals (Survive 1929, Joseph's Test, House Hacker, Late Starter, Family of Four, FIRE by 50, Fresh Start).
- **Achievements**: 25+ unlockables that pop as toasts mid-game. Some are "big" milestones (first $100k, first $1M, decamillionaire) and stop the game with a modal.
- **Uncertainty**: random historical-start mode drops you into 1928-1965 and you live through actual market history without knowing what year you started in.
- **Tension**: every decision has consequences. Selling into a -25% year is a -3 pattern hit; holding through it is +2. Buying a primary home commits you to 2+ years before the §121 exclusion is available. Building a Joseph reserve only matters if you also enable Cycle Rhythm.
- **Replayability**: same seed reproduces a life. Try different strategies against identical markets.

---

## 1. What this game is

You play a single human life: you start somewhere between age 22 and 70, you receive wages each year, you make a small number of decisions, and a real or stochastic market unfolds around you. The engine runs year by year. Each year applies returns, fires life events, computes taxes to the dollar, and scores how closely your behavior matches a set of **patterns** observed in high-performing investors going back to 1928.

Two things matter:

1. **Outcome** — your inflation-adjusted net worth, whether you ran out of money, what you transferred to heirs.
2. **Pattern adherence** — how often you behaved like the disciplined operators the engine is calibrated against.

The game ends when you die (probabilistic SSA-style mortality past 80, certain at 105). You then receive an **archetype** label and a decade-by-decade summary.

---

## 2. How to start a session

1. Double-click `index.html`.
2. **Pick a scenario** at the top of the setup screen. Each scenario has clear goals shown below the dropdown:
   - **Fresh start (open-ended)** — recent grad, no constraints. Default.
   - **Survive 1929** — start age 22 in 1929. Hold through 80%+ drawdown to retirement.
   - **Joseph's Test** — stochastic mode. Maintain ≥1 yr reserve and execute Cycle Rhythm.
   - **House hacker** — execute the Serial Residence Harvester (§121) 3+ times by 60.
   - **Late starter** — age 45 with $50k saved. Reach $1M nominal by 65.
   - **Alabama family** — MFJ, $130k income, two-kid spending. Leave a $2M legacy.
   - **FIRE** — retire at 50 with $3M real and sustain through 90.
3. Customize specific fields if you want. Toggle **Hints: on** to see captions explaining every input.
   - **Starting age** (22 default).
   - **Annual wages** and **wage growth** — wage growth is the *real* component; the engine adds inflation on top each year.
   - **Annual baseline spending** in starting-year dollars. This will inflate.
   - **Filing status** — Single or MFJ. Affects every tax bracket, the §121 exclusion ($250k vs $500k), and SS taxation thresholds.
   - **State** — Alabama is the default and is uniquely advantageous: no state tax on Social Security, no state tax on most retirement income, sales-tax exemption on investment-grade bullion.
   - **Market history mode**:
     - *Random historical start* (recommended): the engine picks a year between 1928 and 1965, then plays the actual sequence from there. You will live through real history.
     - *Sequential 2026 onward*: stochastic from 2026.
     - *Stochastic*: pure Monte Carlo using long-term means and stdevs.
   - **Areas of competence** — multi-select. Affects pattern scoring; investing actively outside your competence is penalized.
   - **Random seed** — leave blank for fresh runs; set explicitly to reproduce a life.
3. Click **Start your investing life** for hand-played mode, or **Autopilot** for the pattern-language default strategy.

---

## 3. The annual cycle (what happens each "Advance")

In order, every year:

1. **Allocation changes execute as trades** at the start of the year. New sleeve weights apply to every account immediately; in the taxable account, reducing risk sleeves *sells appreciated shares* and realizes long-term capital gains that are taxed this year. Whipsawing your allocation has a real tax bill.
2. **Wages received** (taxed on the same figure). Wage growth (real growth + inflation) applies at year-end for the next year.
3. **Spending and home costs** deducted from the Cash/Emergency account. Homes carry mortgage P&I, ~1% annual maintenance, ~0.8% property tax.
4. **Investment property** rents (LTR or STR), operating expenses, mortgage interest, and 27.5-year straight-line depreciation are computed. The actual cash flow (rent − opEx − interest − principal) lands in your cash account. Property values appreciate using the FHFA housing index for the year.
5. **Farmland** cash rent (~3% yield, credited to cash) and price appreciation (USDA NASS series).
6. **Business** cash flow (credited to cash) grows or shocks (4%/yr chance of major loss; otherwise N(10%, 30%)).
7. **Liquid accounts grow sleeve by sleeve** — and the weights *drift*: a portfolio left alone becomes whatever its winners make it. Annual rebalancing (step 13) is what resets weights to your written policy; turning it off means your risk drifts with the market.
8. **RMD** (Required Minimum Distribution) is taken from the Trad 401(k)/IRA if you are at or past the start age (73 if born 1951-1959, 75 if born 1960+).
9. **Social Security**, if claimed, is paid out (with annual COLA = CPI). If you haven't claimed by 70, the engine auto-claims. The benefit is computed from your actual career earnings ledger (top 35 years, capped at the wage base, CPI-indexed bend points).
10. **Withdrawals** to fund the spending target (in retirement) follow the tax-efficient order: cash → taxable (gains from your actual tracked basis) → traditional → Roth.
11. **Taxes computed** to the dollar: federal brackets, capital gains stacked, NIIT, Alabama state, IRMAA if 65+, FICA on wages. Tax bill is debited from cash. If cash is overdrawn (taxes, housing, health), the engine force-liquidates investments to cover it — and those gains hit next year's return.
12. **Roth conversion** (if requested) moves dollars from Trad → Roth and is taxed as ordinary income this year.
13. **Annual rebalance** if enabled (default on) — resets each account's drifted weights to your strategy allocation.
14. **Joseph reserve**: if enabled, a slice of cash is diverted to the reserve bucket during years where stocks were positive ("plenty"). The bucket grows at T-bill.
15. **Cycle Rhythm**: if enabled and last year was a drawdown of -15% or worse, half the reserve auto-deploys into the taxable equity sleeve (you "bought the dip").
16. **Lifestyle absorption**: during working years, unassigned cash above your **cash target** partially drifts into consumption (see §3a). The amount is logged every year and totaled at the end.
17. **Patterns scored**: every decision is checked against the language; the year's deltas are added to your activated/violated totals.
18. **Life events** roll: promotion, layoff, marriage, child, health, inheritance, vacancy, business shock. Your companion ghosts receive the *same* events.
19. **Mortality roll**.

You then make decisions for the *next* year. The cycle repeats.

---

## 3a. The money model: assigned vs unassigned dollars

The single most consequential rule in the engine:

> **Money you deliberately assign is money you keep. Unassigned money drifts away.**

Every dollar of income lands in the Cash/Emergency account. Dollars you direct somewhere — retirement contributions, taxable investing, the Joseph reserve, a down-payment fund (raising your **cash target**), giving, purchases — go where you sent them. Cash *above* your cash target has no assignment, and roughly **half of the excess is absorbed into lifestyle each working year**. The end-of-life report shows the lifetime total, per decade, next to your taxes.

This is not a punishment mechanic; it is the published record of average behavior:

- The U.S. personal saving rate has run ~4-5% of disposable income (BEA, 2024-25) — households that don't automate saving spend what arrives.
- 401(k) participants who *do* automate defer 7.7% on average (Vanguard, *How America Saves 2025*) — and keep it, because it never touches the checking account.

The **cash target** (months of spending, default 6) is your deliberate cash floor: an emergency fund per standard guidance. Raise it for a few years when saving toward a down payment — that makes the cash "assigned" and absorption leaves it alone. Buying an asset can also liquidate taxable holdings automatically if cash falls short (a real sale, with real capital gains tax).

**Wage growth** defaults to 1% real above inflation (long-run SSA Average Wage Index real growth); promotions arrive as life events on top. All displayed "Real" figures deflate by the simulation's actual cumulative CPI, not an assumed constant.

---

## 4. Accounts and what they do

| Account | Pre-tax in? | Tax-free growth? | Tax on withdrawal | Notes |
| --- | --- | --- | --- | --- |
| Roth 401(k) / Roth IRA | No (post-tax) | Yes | None (after 59½) | Best when current bracket ≤ future. No RMDs (Roth IRA). |
| Trad 401(k) / Trad IRA | Yes | Deferred | Ordinary income | RMDs start at 73 or 75 depending on birth cohort. |
| HSA | Yes | Yes for medical | Ordinary if non-medical | The "triple-tax-advantaged" account. |
| Taxable brokerage | No | Annual drag (qualified div + LTCG) | LTCG 0/15/20% + NIIT 3.8% | Step-up at death — best legacy bucket. |
| Cash / Emergency | n/a | n/a | None | The buffer. Grows at T-bill. |
| Joseph Reserve | n/a | n/a | None on growth | Counter-cyclical store. Grows at T-bill. |
| Investment property | n/a | Depreciation shelters income | Recapture + LTCG; 1031 defers | Rental cash flow, leverage allowed. |
| Primary residence | n/a | Imputed rent | **§121 exclusion**: $250k single / $500k MFJ tax-free, every 2 years | Improvements raise basis. |
| Secondary / vacation home | n/a | n/a | LTCG (no §121) | Often a lifestyle drag unless run as STR. |
| Precious metals | n/a | n/a | **Collectibles 28%** LTCG | Alabama exempts bullion sales tax. |

---

## 5. The pattern language (full catalog)

Each pattern declares: **what it watches** (context), **why ignoring it fails** (problem), **what it asks of you** (solution), and **how the engine scores it** each year. Patterns are coupled — activating one usually reinforces or constrains others.

### Layer 0 — Human Capital

- **Human Capital Maximizer**: scores when your real wage growth beats inflation by 2-4%. Your future earnings are your largest asset early; treat skill development and insurance as the first investment. *Couples to*: Compound Early (funds it), Circle of Competence (informs business choice).

### Layer 1 — Foundational (always active)

- **Compound Early and Often**: scores up to +2/year when you save ≥15% under age 35. Time, not return, is the dominant factor in early years.
- **Own the Market Broadly**: +1 when your core sleeve is ≥50% equities at a low fee. Low-turnover total-market indexing.
- **Diversify Across Seasons and Assets**: +1 for ≥3 sleeves active; +1 more for owning a real asset; -1 for >95% equities past 55.
- **Avoid Permanent Loss of Capital**: +1 for ≥3 months of cash; -1 for <1 month; -1 for >85% LTV on properties; -2 for panic-selling in a -15% year.
- **Stay the Course (Behavioral)**: +2 for holding through a -15% year; -3 for cutting equities >5% in a -30% year.
- **Continuous Rebalancing**: +1 when rebalanceAnnually is on.
- **Circle of Competence**: -1 each year you own a property without "real-estate" competence, or a business without "business" competence.
- **Behavioral Fortress (Written IPS)**: +1 each year you stick to a written policy; -1 for high allocation churn (>25% movement in one step).
- **Biblical Stewardship Framework (meta)**: composite over diligence (savings rate), prudence (cash buffer), diversification (≥4 sleeves), generosity (any giving this year). Awards up to +2/year.

### Layer 2 — Asset & Risk Engines

- **Real Asset Income Engine**: +1 each year you hold a rental, farm, or primary residence.
- **Residence as Dual-Use Capital**: +1 for moderate LTV on primary home; -1 if primary home > 60% of net worth past 40; -1 for a vacation home pre-50 with no rental use.
- **Serial Primary Residence Harvester (§121)**: +2 in the year you take a §121 exclusion; -1 if you've cycled ≥4 times pre-55 (dealer-status risk).
- **Judicious Leverage with Margin of Safety**: +1 for property LTV <0.75; -1 for >0.85.
- **Cycle-Aware Allocation**: tilts within Diversify; modeled implicitly through allocation choices.
- **Time in the Market Beats Timing**: implicit — panic-sells lose; sustained holds compound.
- **Inflation Protection Engine**: +2 in a >5% inflation year if you have ≥20% in real assets/metals; -1 if you don't.
- **Precious Metals Fortress**: +1 for 5–15% metals; -1 for >30% (over-allocated insurance).
- **Joseph's Cycle-Reserve Strategy**: +1 for ≥1 year of spending in the reserve bucket; +1 more in a year stocks were >+15% and your Joseph rate ≥10%.
- **Cycle Rhythm Navigator**: +2 in any year you deployed reserves into a >10% correction.
- **Nehemiah's Focused Rebuild Protocol**: +1 when you maintain a business or §121-eligible primary home for ≥3 consecutive years (focused execution under pressure).

### Layer 3 — Tax & Account Optimization (cross-cutting)

- **Tax-Advantaged Maximizer**: +2 when sheltered contributions are ≥2× taxable contributions and >$5k.
- **Tax Shelter Allocation by Life Season**: directs *where* every other pattern's assets live. Bonds in trad, growth in Roth, qualified equities in taxable.
- **Pre-Tax Account Bridge (Roth Conversion Ladder)**: +2 in gap years (retired, age 60 to RMD start) when you convert >$5k.
- **Charitable Multiplier**: +1 for any giving >5% of wages while working; +2 for any QCD >$5k post-70.

### Layer 4 — Retirement Distribution

- **Sequence-of-Returns Shield (Buckets)**: +1 for 2-6 years of spending in cash; -1 for <1.
- **Social Security Longevity Optimizer**: +2 for claiming at 70+; +1 for FRA+ (67+); -1 for claiming at 62.
- **Retirement Spending Curve**: +1 if you choose smile or declining (matches empirical "go-go / slow-go / no-go" data).

### Layer 5 — Legacy

- **Legacy and Step-Up Basis**: +1 past 70 if you hold >$250k of taxable gains untouched (step-up will erase them for heirs).

---

## 6. How patterns couple (the generative rules)

Examples of couplings the engine encodes:

- **Compound Early + Tax Shelter** — Roth-heavy contributions early amplify both patterns. Adding taxable saving counts less.
- **Real Asset + Judicious Leverage + Avoid Permanent Loss** — buying a property *boosts* the first two but tightens the third (the engine wants more cash reserves).
- **§121 Harvester + Behavioral Fortress** — selling every 2-3 years is a tax win but lifestyle-creep risk; the engine penalizes >4 cycles pre-55.
- **Pre-Tax Bridge + SS Optimizer** — converting in gap years reduces future RMDs and provisional income, lowering SS taxation in your 70s.
- **Joseph Reserve + Cycle Rhythm** — storing in bulls *enables* deploying in bears. Joseph without Cycle Rhythm only earns T-bill; Cycle Rhythm without Joseph has nothing to deploy.
- **Curved Spending + Sequence Shield** — front-loaded spending raises sequence risk, which the buckets exist to absorb.
- **Inflation Protection + Real Asset + Metals** — these three are the same defense from different angles. The engine wants at least one of them active at >5% inflation.
- **Biblical Stewardship (meta)** — sits over everything. Diligence rewards saving, prudence rewards reserves, diversification rewards sleeve count, generosity rewards giving. It is the only pattern that scores all four at once.

---

## 7. What decisions you make each year

In **working years** (not retired):

- **Contributions** to Roth 401(k), Trad 401(k), Roth IRA, Trad IRA, HSA, and Taxable. Suggested values appear pre-filled. 2026 limits: 401(k) $23,500 ($31k catch-up at 50+); IRA $7,500 ($8,500 catch-up); HSA $4,300.
- **Allocation**: stocks / bonds / cash / REIT / metals — must sum to 100%.
- **Major moves** (buttons): Buy primary home, Buy vacation home, Buy rental ($150k), Buy STR ($250k), Buy farmland ($80k cash), Start business ($50k). Once you own a primary, the button changes to **Remodel** ($30k → +$45k value, +$30k basis) and after 2 years of ownership, **Sell primary (§121)** appears.
- **Stewardship & strategy**: Joseph reserve rate (0–25% of excess cash skimmed to reserves in good years), charitable giving this year ($), Cycle Rhythm toggle (auto-deploy reserves into corrections).

In **retirement** (after clicking Retire or auto-retire):

- Same allocation controls.
- **Spending curve**: Flat (constant real), Smile (15% higher first decade, dip mid, +5% late), Declining (−1% per year).
- **Roth conversion** this year ($) — best executed in gap years.
- **Claim Social Security** button if not yet claimed; auto-claims at 70.
- **QCD** (Qualified Charitable Distribution) input once you reach age 70 — donates directly from IRA to charity, offsetting taxable RMD.

---

## 7a. The Stewardship Score (how the game keeps score)

A single composite number, visible at all times in the status bar. Roughly 0–1000 over a full life.

```
Stewardship Score = pattern_net + 15 × achievements + survival_bonus + wealth_bonus − shortfall_penalty
```

Where:
- `pattern_net` = activated pattern points minus violated pattern points (typically reaches +400 to +700 by retirement on a disciplined run).
- `15 × achievements` = each unlocked achievement adds 15.
- `survival_bonus` = 100 if you end life with positive net worth.
- `wealth_bonus` = up to +200 for real (inflation-adjusted) final NW, capped at $10M real.
- `shortfall_penalty` = −150 if you ever ran out of money mid-life.

The score is *not* a substitute for any individual metric — it's a deliberately blunt single-number summary so a "game" can be compared to other runs.

## 7b. Achievements

25+ unlockable badges. They fire as toasts when triggered; "big" ones (wealth crossings) trigger a pause-the-game milestone modal. Each is visible in the final report as 🏆 (unlocked) or 🔒 (locked).

Categories:
- **Wealth milestones**: First $100k, Millionaire, Decamillionaire, Nine-Figure NW.
- **Behavioral**: Bought the Dip, Held Through the Storm, First Roth Contribution, Maxed the 401(k).
- **Real assets**: First Rental, First Home, §121 Tax-Free Sale, Serial Harvester (3 sales), Three-Year Business.
- **Tax/retirement**: Roth Conversion Ladder, Delayed SS to 70, First QCD.
- **Stewardship**: Filled the Granary (Joseph reserve ≥1 yr spending), Generous Decade ($50k giving), Pattern Net +500.
- **Crashes survived**: Survived a Bear, Survived 2008, Survived the Crash of 1929.
- **Life completion**: Retired by 65, Retired by 55 (FIRE), Lasted to 90 with money.

## 7c. The three ghosts (live comparison)

Two companion lives are created the moment yours begins, from the same starting conditions, and they advance every time you do — through the **identical world**. Identical means exactly that: they receive the same market returns you received (recorded and replayed, not re-rolled), the same promotions, layoffs, marriage, children, health costs and inheritances (replayed with the same magnitudes), and they live exactly as long as you do.

- **Mainstream Autopilot** — published-average behavior, verified against sources: 7.7% deferral (Vanguard *How America Saves 2025*), the Vanguard target-date glide path (90% equity at 25 → 50% at 65 → 30% at 72), Social Security at FRA (67). No Roth conversions, no §121 cycling, no reserves, no real assets.
- **Pattern-Disciplined** — the full pattern-language autopilot: 15% savings, Roth-first early, glide with a metals sleeve, gap-year Roth conversions, SS delayed to 70.
- **You** — whatever you actually did.

Both ghosts retire at 65 so retirement *timing* is never the confound; claiming age and everything else is strategy. Their trajectories draw on your chart from year one, and the final report shows each life's ending wealth, real wealth, lifetime taxes, and lifetime lifestyle absorption. The number the game exists to surface is the gap between Mainstream and Pattern-Disciplined **in the same life** — and where, in the ledgers, it came from.

## 8. The metrics you'll see

**Status bar (top)**: age, year, total net worth, real net worth (deflated by the sim's actual cumulative CPI), current wages or "retired", spending target, life-stage label.

**Wealth trajectory chart**: your net worth line, the two ghost lines (Pattern-Disciplined dotted blue, Mainstream dashed red), and red dots marking years where the S&P 500 fell more than 15%.

**Accounts panel**: every account balance + real assets (primary home equity, secondary, properties, farmland, business, Joseph reserve, lifetime giving).

**Pattern guidance**: one-line situational advice per active pattern + running pattern score.

**Messages stream**: market events, life events, property purchases, §121 sales, reserve deployments, big tax events.

**Final report**: peak net worth, cumulative taxes, lifetime lifestyle absorption, max drawdown, pattern score (+/-/net), the three-lives comparison with each life's ledger, top reinforced and violated patterns, archetype assignment, decade-by-decade table (wages avg, spending avg, lifestyle absorbed, net worth at decade end, taxes for decade).

**Archetype assignments** (chosen by your dominant behavior):

- **Boglehead Indexer** — broad equity ownership, no real-asset bets.
- **Real-Asset Operator** — 2+ properties/farm with conservative leverage.
- **Owner-Operator** — concentrated equity in your own business.
- **Pattern-Disciplined Compounder** — high net pattern score, balanced.
- **Behavioral Investor** — net negative pattern score; emotion-driven.
- **Balanced Diversifier** — composite of paper + real, resilient.

---

## 9. The tax system in detail

The engine computes federal + Alabama tax to the dollar each year using 2026 brackets (single/MFJ).

- **Ordinary brackets**: 10/12/22/24/32/35/37%.
- **Standard deduction**: $15,800 single, $31,600 MFJ; +$2,050 (single) or $1,650 (MFJ) per spouse at 65+.
- **Long-term capital gains and qualified dividends**: 0/15/20% stacked on top of ordinary, with 0% bracket ending at $49,000 single / $98,000 MFJ.
- **Collectibles** (physical metals): 28% LTCG rate.
- **NIIT**: 3.8% on net investment income above $200k single / $250k MFJ MAGI.
- **Social Security taxation**: provisional income (other income + half of SS) above $25k single / $32k MFJ pulls 50%+ of benefits into ordinary income; above $34k/$44k pulls 85%.
- **IRMAA** Medicare surcharges kick in past $106k single / $212k MFJ MAGI at 65+.
- **FICA**: 7.65% on wages up to $176,100, +Medicare add-ons above $200k/$250k.
- **Section 121**: up to $250k single / $500k MFJ excluded on primary home gain, claimable every 2 years.
- **QCD**: up to $108k/yr from IRA to charity, ages 70.5+, satisfies RMD without income tax.
- **Alabama**: 2%/4%/5% brackets, $3k/$8.5k standard deduction, *exempts* Social Security and most retirement income, *exempts* investment-grade bullion sales.
- **Above-the-line deductions** applied: Trad 401(k), Trad IRA (simplified — treated as deductible), HSA.
- **Itemized vs standard**: engine compares (charitable + mortgage interest cap + SALT cap $10k) to standard and uses whichever is larger.

---

## 10. Quick strategy primer (how to actually play well)

**Early career (22-35)**:
- Push Roth 401(k) + Roth IRA + HSA to the limit. You're in a low bracket; pay the tax now to grow forever tax-free.
- Allocation 80-90% stocks. Maybe 5% metals as insurance.
- Saving toward a down payment? Raise the **cash target** to 18-24 months a few years ahead — assigned cash is protected cash. Drop it back after the purchase.
- Buy a primary home only if you'll live there 3+ years. Otherwise the transaction costs kill the deal.
- Build your Circle of Competence in *one* extra area before owning that asset class.

**Mid-career (35-55)**:
- Mix Trad and Roth as your bracket climbs into the 22-24% zone.
- Add one rental (or farmland, or business) at the edge of your competence.
- Glide equity allocation down ~1% per year. By 55 you should be ~70/20/5/5 stocks/bonds/reit/metals.
- Turn on Joseph reserve rate at 10-15%. Turn on Cycle Rhythm.
- Consider the §121 cycle: every 3-4 years, sell, harvest tax-free gain, buy the next.

**Late career / pre-retirement (55-65)**:
- Cash bucket = 2-3 years of spending. Sequence shield active.
- If you'll retire before 73, plan the Roth conversion ladder: convert in gap years before SS and RMDs to fill the top of the 22% (or 24%) bracket.
- Delay SS — start using the portfolio to bridge. The 8%/year delay credit from 67 to 70 is risk-free 8%.

**Early retirement (65-75)**:
- Spending curve: Smile if your taste is "experiences early, calm later."
- Withdraw taxable first (locks in step-up planning), then traditional, then Roth last.
- Continue Roth conversions until RMD start.

**Late retirement (75+)**:
- QCDs from your IRA to charity satisfy RMDs without ordinary income.
- Don't sell appreciated taxable assets — your heirs get the step-up.
- Real-asset cash flow is your inflation-protected income floor.

---

## 11. Sample lifetimes you can try

| Persona | Setup |
| --- | --- |
| **Recent grad** | age 22, wages $55k, spending $30k, single, AL |
| **Mid-career engineer** | age 38, wages $130k, spending $70k, MFJ, AL |
| **Pre-retiree** | age 55, wages $180k, spending $90k, MFJ, AL, "real-estate" + "stocks" competence |
| **House hacker** | age 26, wages $70k, spending $35k, then buy primary at 26 and sell at 28 (§121 every other year) |
| **Joseph in plenty** | autopilot, turn on Joseph rate 20% and Cycle Rhythm — observe reserve deployments in 1973-74, 2000-02, 2008-09 if your historical start crosses them |
| **Buffett-style operator** | autopilot, age 22, buy business at 32, never sell |

To get the same life twice for comparison, set the same random seed.

---

## 12. Limitations (be honest about these)

- One household, one earner (no spouse income trajectory).
- No state-by-state tax engine besides Alabama; CA / TX / FL toggles are placeholders.
- Property values use a national index; no local market.
- Health is a single probabilistic shock; no Long-Term Care insurance modeling.
- Business modeled as one shock-prone equity stake; no acquisition or exit dynamics.
- Federal brackets are 2026 estimates and are *not* adjusted across decades; in reality brackets would re-baseline. (SS bend points and the wage base *are* CPI-indexed inside the sim so benefits stay commensurate with lifetime wages.)
- Lifestyle absorption is a single calibrated rate (~50%/yr of unassigned excess cash); real households vary. It is calibrated to reproduce the BEA personal saving rate for undirected behavior and is identical for you and both ghosts, so comparisons are fair even if the level is argued.
- Annual rebalancing is modeled tax-free (in practice: new-contribution steering and dividend redirection make most of it tax-managed); *changing* your allocation is taxed as a real trade.
- Forced liquidations tax their gains one year late (a bookkeeping simplification).
- No employer 401(k) match is modeled — for any strategy, so comparisons are unaffected.
- No early-withdrawal penalty before 59½ on forced liquidations.
- Mortgage rates are entered manually (default 6.5%); no dynamic rate environment.
- Inheritance is a probabilistic event; no actual estate transfer modeling of *your* assets.

The simulation is *illustrative*. Past patterns don't predict future results. Talk to a fiduciary and CPA before acting on any insight gained here.

---

## 13. Files in this project

```
index.html                 — entry point; open in a browser
styles/main.css            — dark-theme UI
data/historical.js         — S&P/Treasuries/T-bill/CPI/housing/farmland/gold 1928-2024
js/tax.js                  — federal + AL tax engine
js/engine.js               — core simulation
js/patterns.js             — all patterns + scoring
js/events.js               — life events
js/ui.js                   — screens and chart
js/main.js                 — bootstrap
test/headless.js           — Node sanity tests
test/strategies.js         — pattern vs anti-pattern comparison
test/uiverify.js           — Playwright UI driver
MANUAL.md                  — this document
```

To re-validate after changes: `node test/headless.js` for engine, `node test/uiverify.js` for the UI.

---

*Wealth Seasons is a documentation of observed lessons translated into a playable system. Use it to internalize the couplings. Argue with the engine — it's where your intuition gets sharpened.*
