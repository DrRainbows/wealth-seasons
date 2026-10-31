/*
 * Life and policy events: triggered probabilistically each year,
 * coupled to current state. Designed to expose the patterns to stress.
 *
 * Each event separates the RANDOM part (roll → params) from the DETERMINISTIC
 * part (apply(state, params) → message). applyAll() rolls and applies for the
 * primary sim and records what fired on the year's history log; replay()
 * applies the same recorded params to a companion ("ghost") sim so both live
 * through the identical life — same promotions, same children, same shocks.
 * Asset-coupled events (vacancy, business) only apply if the sim owns them.
 */
window.GAME = window.GAME || {};
GAME.events = (function () {

  function roll(state, prob){ return state.rng.next() < prob; }

  const EVENTS = [
    {
      id: 'job-promotion',
      gate(s){ return !s.retired && s.age < 55; },
      roll(s){
        if (roll(s, 0.04)) return { bump: 0.10 + s.rng.next() * 0.20 };
        return null;
      },
      apply(s, p){
        s.wages *= (1 + p.bump);
        return { msg: `Promotion: wages +${Math.round(p.bump*100)}%.`, level: 'info' };
      }
    },
    {
      id: 'layoff',
      gate(s){ return !s.retired && s.age > 28 && s.age < 60; },
      roll(s){
        if (roll(s, 0.015)) return { lost: 0.5 + s.rng.next() * 0.5 };
        return null;
      },
      apply(s, p){
        s.wages *= (1 - p.lost*0.2);
        return { msg: `Layoff/recession hit your role; wages reset lower for ${Math.ceil(p.lost*2)}y.`, level: 'warn' };
      }
    },
    {
      id: 'marriage',
      gate(s){ return s.opts.status === 'single' && s.age > 24 && s.age < 40; },
      roll(s){
        if (roll(s, 0.025)) return { spouseOffset: Math.floor((s.rng.next()-0.5)*6) };
        return null;
      },
      apply(s, p){
        s.opts.status = 'mfj';
        s.ageSpouse = s.age + p.spouseOffset;
        return { msg: `You got married. Filing status changed to MFJ.`, level: 'info' };
      }
    },
    {
      id: 'child',
      gate(s){ return s.age > 25 && s.age < 45 && s.opts.status === 'mfj'; },
      roll(s){ return roll(s, 0.06) ? {} : null; },
      apply(s){
        s.spendBase *= 1.07;
        return { msg: `New child. Annual spending +7%.`, level: 'info' };
      }
    },
    {
      id: 'health',
      gate(s){ return s.age > 50; },
      roll(s){
        const p = s.age < 65 ? 0.03 : 0.08;
        if (roll(s, p)) return { cost: (s.age > 70 ? 25000 : 12000) * (0.5 + s.rng.next()) };
        return null;
      },
      apply(s, p){
        s.accounts.cash.balance -= p.cost;
        return { msg: `Health event — $${Math.round(p.cost).toLocaleString()} out of pocket.`, level: 'warn' };
      }
    },
    {
      id: 'inheritance',
      gate(s){ return s.age > 40 && s.age < 75; },
      roll(s){
        if (roll(s, 0.012)) return { amt: 80000 + s.rng.next() * 250000 };
        return null;
      },
      apply(s, p){
        s.accounts.taxable.balance += p.amt;
        s.accounts.taxable.basis += p.amt; // step-up
        return { msg: `Inheritance of $${Math.round(p.amt).toLocaleString()} (stepped-up basis).`, level: 'info' };
      }
    },
    {
      id: 'tax-policy',
      gate(){ return true; },
      roll(s){ return roll(s, 0.03) ? { drift: 0.005 } : null; },
      apply(s, p){
        s.cumulativeTaxes += s.history.length > 0 ? s.history[s.history.length-1].tax * p.drift : 0;
        return { msg: `Tax law change — modest adjustment to brackets.`, level: 'info' };
      }
    },
    {
      id: 'real-estate-vacancy',
      gate(s){ return s.properties.length > 0; },
      roll(s){ return roll(s, 0.05) ? { u: s.rng.next() } : null; },
      apply(s, p){
        if (!s.properties.length) return null;
        const idx = Math.min(s.properties.length - 1, Math.floor(p.u * s.properties.length));
        const prop = s.properties[idx];
        prop.capRate *= 0.7;
        return { msg: `Vacancy/repair year on ${prop.kind}: rental income reduced.`, level: 'warn' };
      }
    },
    {
      id: 'business-shock',
      gate(s){ return !!s.business; },
      roll(s){ return roll(s, 0.06) ? {} : null; },
      apply(s){
        if (!s.business) return null;
        s.business.value *= 0.6;
        return { msg: `Business setback — value down 40%.`, level: 'warn' };
      }
    }
  ];

  function applyAll(state){
    const fired = [];
    for (const e of EVENTS){
      if (!e.gate(state)) continue;
      const params = e.roll(state);
      if (!params) continue;
      const result = e.apply(state, params);
      if (result){
        fired.push({ id: e.id, params, msg: result.msg, level: result.level });
        state.messages.push({ year: state.year, level: result.level, msg: `[${e.id}] ${result.msg}` });
      }
    }
    // Record on the year just simulated so companion sims can replay it
    if (state.history.length) state.history[state.history.length-1]._events = fired;
    return fired;
  }

  // Re-apply another sim's recorded events. Person-level events (career,
  // family, health) land identically because the ghost's age/status/wages
  // track the original; asset-level events skip if the ghost lacks the asset.
  function replay(state, fired){
    if (!fired || !fired.length) return;
    for (const f of fired){
      const e = EVENTS.find(x => x.id === f.id);
      if (!e) continue;
      if (!e.gate(state)) continue;
      e.apply(state, f.params || {});
    }
  }

  return { applyAll, replay, EVENTS };
})();
