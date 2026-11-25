// Token Launch Radar v3: the farm verdict.
//
// For one deposit held for the plan's weeks, what does the radar's own valuation say the wait is worth?
//
//   expected drop  = odds x value_if_launch x drop_share x deposit / (TVL + deposit)
//   cost           = gas for every transaction of the plan + fees in and out + the 4% T-bill the
//                    same money would have earned over the hold
//   net            = expected drop - cost;   hours = setup minutes + 5 minutes a week
//
//   FARM      net > 0 and net per hands-on hour at least the hourly bar
//   MARGINAL  net > 0 but under the bar
//   SKIP      the cost is more than the expected drop
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
  grid_deposits: [1_000, 5_000, 25_000],
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
  const cost = gas + fees + bill;
  const net = drop - cost;
  const hours = (s.setup_minutes + VERDICT.weekly_minutes * weeks) / 60;
  const perHour = net / hours;
  const call: Call = net > 0 && perHour >= VERDICT.hourly_bar_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return { drop_usd: r2(drop), gas_usd: r2(gas), fees_usd: r2(fees), tbill_usd: r2(bill), cost_usd: r2(cost), net_usd: r2(net), hours: r2(hours), per_hour_usd: r2(perHour), call };
}

export interface Verdict extends Net {
  deposit_usd: number;
  weeks: number;
  breakeven_share: number; // the drop share at which net is zero
  grid: number[][]; // net by [share][deposit], deposits = grid_deposits
  by_weeks: number[]; // net at the plan's deposit and share, by grid_weeks
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
    by_weeks: VERDICT.grid_weeks.map((w) => netFor(p, v, s, s.deposit_usd, VERDICT.drop_share, w).net_usd),
  };
}
