// Token Launch Radar v2: the farm verdict.
//
// For one deposit held for the plan's weeks, what does the radar's own valuation say the wait is worth?
//
//   expected drop   = odds x value_if_launch x drop_share x deposit / (TVL + deposit)
//   cost            = gas for the plan + entry/exit fees + the T-bill the same money would have earned
//   net             = expected drop - cost
//   hands-on hours  = setup + a few minutes a week
//
//   GO     net > 0 and net per hands-on hour >= the hourly bar
//   WATCH  net > 0 but under the bar
//   PASS   the cost is more than the expected drop
//
// drop_share is the one assumption the snapshot cannot supply (the share of a launch's value handed
// to its users); the page shows it, and the grid shows the verdict across other shares and deposits.

import type { Protocol, Valuation } from './model.ts';
import type { PlanSummary } from './farm.ts';

export const VERDICT = {
  // the deposit is the plan's own position (0.01% of TVL, $500..$10,000, more across chains)
  drop_share: 0.05,
  tbill_rate: 0.04,
  fee_rate: 0.001, // entry + exit, swaps and deposit fees, of the deposit
  hourly_bar_usd: 20,
  minutes_per_week: 6,
  grid_shares: [0.025, 0.05, 0.1],
  grid_multiples: [0.25, 0.5, 1, 2.5], // of the plan's deposit
};

export type Call = 'GO' | 'WATCH' | 'PASS';

export interface Verdict {
  call: Call;
  deposit_usd: number;
  weeks: number;
  drop_usd: number;
  gas_usd: number;
  fees_usd: number;
  tbill_usd: number;
  net_usd: number;
  hours: number;
  net_per_hour_usd: number;
  breakeven_share: number; // the drop share at which net is zero
  grid_deposits: number[];
  grid: number[][]; // net by [share][deposit]
}

const r2 = (x: number) => Math.round(x * 100) / 100;

function netFor(p: Protocol, v: Valuation, s: PlanSummary, deposit: number, share: number) {
  const weeks = s.hold_weeks;
  const drop = v.odds * v.value_if_launch_usd * share * (deposit / (p.tvl_usd + deposit));
  const gas = (s.gas_low_usd + s.gas_high_usd) / 2;
  const fees = deposit * VERDICT.fee_rate;
  const tbill = deposit * VERDICT.tbill_rate * (weeks * 7) / 365;
  return { weeks, drop, gas, fees, tbill, net: drop - gas - fees - tbill };
}

export function verdict(p: Protocol, v: Valuation, s: PlanSummary): Verdict {
  const d = s.capital_usd;
  const deps = VERDICT.grid_multiples.map((m) => Math.round(d * m));
  const n = netFor(p, v, s, d, VERDICT.drop_share);
  const hours = (s.setup_minutes + VERDICT.minutes_per_week * n.weeks) / 60;
  const perHour = n.net / hours;
  const call: Call = n.net > 0 && perHour >= VERDICT.hourly_bar_usd ? 'GO' : n.net > 0 ? 'WATCH' : 'PASS';
  const dropPerShare = n.drop / VERDICT.drop_share;
  const cost = n.gas + n.fees + n.tbill;
  return {
    call,
    deposit_usd: d,
    weeks: n.weeks,
    drop_usd: r2(n.drop),
    gas_usd: r2(n.gas),
    fees_usd: r2(n.fees),
    tbill_usd: r2(n.tbill),
    net_usd: r2(n.net),
    hours: r2(hours),
    net_per_hour_usd: r2(perHour),
    breakeven_share: dropPerShare > 0 ? Math.round((cost / dropPerShare) * 1e6) / 1e6 : 1,
    grid_deposits: deps,
    grid: VERDICT.grid_shares.map((sh) => deps.map((dep) => r2(netFor(p, v, s, dep, sh).net))),
  };
}
