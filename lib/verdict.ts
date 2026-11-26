// Token Launch Radar v4: the farm verdict.
//
// For one deposit held for the plan's weeks, what does the radar's own valuation say the wait is worth?
//
//   expected drop  = odds x value_if_launch x drop_share x deposit / (TVL + deposit)
//   cost           = gas for every transaction of the plan + fees in and out
//   net            = expected drop - cost (net of fees);   hours = setup minutes + 5 minutes a week
//   T-bill         = what the same money earns in a 4% T-bill over the hold: the bar a farm must beat
//
//   FARM      after the T-bill too, what is left pays at least the hourly bar per hands-on hour
//   MARGINAL  the drop beats gas and fees, but not the T-bill plus the hourly bar
//   SKIP      gas and fees are more than the expected drop
//
// Yield the deposit earns inside the protocol is left out (the snapshot carries no rates), so the
// T-bill is a benchmark the verdict must clear rather than a cost subtracted from every row.
//
// drop_share (the share of a launch's value handed to its users) is the one figure the snapshot
// cannot supply. The page says so, lets the reader move it, and every row's grid shows the verdict at
// other shares, deposits and holds. dashboard/radar.js repeats this formula and checks it agrees.

import type { Protocol, Valuation } from './model.ts';
import type { PlanSummary } from './farm.ts';

export const VERDICT = {
  drop_share: 0.075,
  tbill_rate: 0.04,
  base_fee_rate: 0.001, // slippage and withdrawal fees, of the deposit
  hourly_bar_usd: 25,
  weekly_minutes: 5,
  grid_shares: [0.035, 0.075, 0.15],
  grid_deposits: [1_000, 5_000, 10_000, 25_000],
  farm_deposits: [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000],
  grid_weeks: [4, 8, 13, 26],
};

export type Call = 'FARM' | 'MARGINAL' | 'SKIP';

export interface Net {
  drop_usd: number;
  gas_usd: number;
  fees_usd: number;
  tbill_usd: number;
  cost_usd: number;
  net_usd: number;
  beat_usd: number; // net minus the T-bill: what farming earns over parking the money
  hours: number;
  per_hour_usd: number;
  call: Call;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function netFor(p: Protocol, v: Valuation, s: PlanSummary, deposit: number, share: number, weeks: number, tbill = VERDICT.tbill_rate): Net {
  const drop = v.odds * v.value_if_launch_usd * share * (deposit / (p.tvl_usd + deposit));
  const gas = s.gas_tx_usd * (s.setup_txs + weeks + s.exit_txs);
  const fees = deposit * ((2 * s.fee_pct) / 100 + VERDICT.base_fee_rate);
  const bill = (deposit * tbill * weeks * 7) / 365;
  const cost = gas + fees;
  const net = drop - cost;
  const beat = net - bill;
  const hours = (s.setup_minutes + VERDICT.weekly_minutes * weeks) / 60;
  const perHour = net / hours;
  const call: Call = beat / hours >= VERDICT.hourly_bar_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return { drop_usd: r2(drop), gas_usd: r2(gas), fees_usd: r2(fees), tbill_usd: r2(bill), cost_usd: r2(cost), net_usd: r2(net), beat_usd: r2(beat), hours: r2(hours), per_hour_usd: r2(perHour), call };
}

export interface Verdict extends Net {
  deposit_usd: number;
  weeks: number;
  breakeven_share: number; // the drop share at which net is zero
  grid: number[][]; // net by [share][deposit], deposits = grid_deposits
  by_weeks: number[][]; // net at the plan's deposit, by [share][weeks], weeks = grid_weeks
  farm_deposit_usd: number | null; // the smallest of farm_deposits at which the plan clears FARM
  farm_share: number; // the drop share at which the plan deposit clears FARM
}

export function verdict(p: Protocol, v: Valuation, s: PlanSummary): Verdict {
  const n = netFor(p, v, s, s.deposit_usd, VERDICT.drop_share, s.weeks);
  const perShare = n.drop_usd / VERDICT.drop_share;
  return {
    ...n,
    deposit_usd: s.deposit_usd,
    weeks: s.weeks,
    breakeven_share: perShare > 0 ? Math.round((n.cost_usd / perShare) * 1e5) / 1e5 : 1,
    grid: VERDICT.grid_shares.map((sh) => VERDICT.grid_deposits.map((d) => netFor(p, v, s, d, sh, s.weeks).net_usd)),
    by_weeks: VERDICT.grid_shares.map((sh) => VERDICT.grid_weeks.map((w) => netFor(p, v, s, s.deposit_usd, sh, w).net_usd)),
    farm_deposit_usd: VERDICT.farm_deposits.find((d) => netFor(p, v, s, d, VERDICT.drop_share, s.weeks).call === 'FARM') ?? null,
    // beat/hours = bar  <=>  share x perShare = cost + T-bill + bar x hours
    farm_share: perShare > 0 ? Math.round(((n.cost_usd + n.tbill_usd + VERDICT.hourly_bar_usd * n.hours) / perShare) * 1e5) / 1e5 : 1,
  };
}
