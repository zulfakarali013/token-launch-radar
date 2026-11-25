// Token Launch Radar: farm plans.
//
// Every board row gets 5 to 7 concrete steps, each naming what it costs and how long it takes. The
// plan is built from the row's own figures: its category picks the action, its chains set the gas
// bill, its TVL sizes a sensible position, its 7-day change sets the urgency, and its days without a
// token set how long to stay in.

import type { Protocol, Valuation } from './model.ts';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Rough cost of one transaction on the protocol's cheapest listed chain, in US dollars. */
const GAS_USD: Record<string, [number, number]> = {
  Ethereum: [2, 12],
  Bitcoin: [1, 6],
  Solana: [0.01, 0.05],
  Arbitrum: [0.05, 0.3],
  Base: [0.02, 0.2],
  Optimism: [0.05, 0.3],
  BSC: [0.05, 0.3],
  Polygon: [0.01, 0.1],
  Avalanche: [0.05, 0.4],
  Sui: [0.01, 0.05],
  Aptos: [0.01, 0.05],
  Hyperliquid: [0.01, 0.1],
  'Hyperliquid L1': [0.01, 0.1],
  TON: [0.02, 0.1],
  Tron: [0.5, 2],
};
const OTHER_GAS: [number, number] = [0.05, 0.5];

export function cheapestChain(chains: string[]): { chain: string; gas: [number, number] } {
  let best = { chain: chains[0] ?? 'Ethereum', gas: GAS_USD[chains[0] ?? 'Ethereum'] ?? OTHER_GAS };
  for (const c of chains) {
    const g = GAS_USD[c] ?? OTHER_GAS;
    if (g[1] < best.gas[1]) best = { chain: c, gas: g };
  }
  return best;
}

const usd = (x: number) => (x >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : `$${x.toFixed(2)}`);
const gasRange = (g: [number, number], txs: number) => `${usd(g[0] * txs)}-${usd(g[1] * txs)} gas`;

type Action = { verb: string; what: string; txs: number; feePct: number; risk: string };

function actionFor(category: string | null): Action {
  switch (category) {
    case 'Dexs':
      return { verb: 'Provide liquidity', what: 'provide liquidity to a deep stable or blue-chip pool and swap through it weekly', txs: 3, feePct: 0.3, risk: 'impermanent loss on volatile pairs' };
    case 'Derivatives':
    case 'Interest Rate Derivatives':
    case 'Prediction Market':
      return { verb: 'Trade small size', what: 'trade small size with tight stops, and keep a little collateral in its vault or LP pool', txs: 4, feePct: 0.1, risk: 'liquidation and trading fees outrunning points' };
    case 'Lending':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
    case 'CDP':
    case 'CDP Manager':
      return { verb: 'Supply', what: 'supply a stablecoin and borrow modestly against it (keep the loan-to-value under 40%)', txs: 3, feePct: 0, risk: 'bad debt or a collateral depeg' };
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Restaked BTC':
    case 'Staking Pool':
      return { verb: 'Stake', what: 'stake the native asset and hold the receipt token rather than selling it', txs: 2, feePct: 0, risk: 'slashing or a receipt-token discount' };
    case 'Bridge':
    case 'Cross Chain Bridge':
      return { verb: 'Bridge', what: 'bridge across two of its routes, there and back, a few times a month', txs: 4, feePct: 0.05, risk: 'a bridge exploit' };
    case 'RWA':
    case 'Basis Trading':
    case 'Dual-Token Stablecoin':
    case 'Stablecoin Wrapper':
      return { verb: 'Mint or deposit', what: 'mint or deposit into its yield-bearing dollar and hold it, or loop it once where a lending market lists it', txs: 3, feePct: 0.1, risk: 'a depeg or a redemption queue' };
    default:
      return { verb: 'Deposit', what: 'deposit into its main vault and leave it compounding', txs: 2, feePct: 0, risk: 'smart-contract risk in a young vault' };
  }
}

export interface PlanSummary {
  capital_usd: number;
  setup_minutes: number;
  gas_low_usd: number;
  gas_high_usd: number;
  hold_weeks: number;
  chain: string;
}

/** The whole plan at a glance: capital, setup time, total gas over the hold, and how long to stay. */
export function planSummary(p: Protocol, v: Valuation): PlanSummary {
  const { chain, gas } = cheapestChain(p.chains);
  const a = actionFor(p.category);
  const size = positionSize(p);
  const hold = holdWeeks(v);
  const extra = p.chains.length > 1 ? (GAS_USD[p.chains.find((c) => c !== chain) ?? chain] ?? OTHER_GAS) : ([0, 0] as [number, number]);
  const txs = 1 + a.txs + hold + 2; // fund, enter, one interaction a week, exit
  const xtxs = p.chains.length > 1 ? a.txs + 1 : 0;
  return {
    capital_usd: size + (p.chains.length > 1 ? size / 4 : 0),
    setup_minutes: 15 + 20 + 10 + (p.chains.length > 1 ? 20 : 0),
    gas_low_usd: Math.round((gas[0] * txs + extra[0] * xtxs) * 100) / 100,
    gas_high_usd: Math.round((gas[1] * txs + extra[1] * xtxs) * 100) / 100,
    hold_weeks: hold,
    chain,
  };
}

function positionSize(p: Protocol): number {
  return Math.max(1_000, Math.min(10_000, Math.round((p.tvl_usd * 0.001) / 100) * 100));
}

function holdWeeks(v: Valuation): number {
  const d = v.days_without_token;
  return d === null ? 8 : d > 540 ? 6 : d > 180 ? 10 : 14;
}

export function farmPlan(p: Protocol, v: Valuation): FarmStep[] {
  const { chain, gas } = cheapestChain(p.chains);
  const a = actionFor(p.category);
  // Position: big enough to register, small against the pool (never more than 0.1% of TVL, $1,000..$10,000).
  const size = positionSize(p);
  const hot = (p.change_7d ?? 0) >= 10;
  const cold = (p.change_7d ?? 0) <= -10;
  const days = v.days_without_token;
  const weeks = holdWeeks(v);
  const steps: FarmStep[] = [];

  steps.push({
    text: `Open the official ${p.name} app from its DefiLlama listing (never a search ad), connect a fresh wallet on ${chain}, and fund it with ${usd(size)} in stablecoins plus gas.`,
    cost: `${gasRange(gas, 1)} to fund the wallet`,
    time: '15 min',
  });
  steps.push({
    text: `Put ${usd(size)} to work on ${chain}: ${a.what}.`,
    cost: `${gasRange(gas, a.txs)}${a.feePct ? `, ~${usd((size * a.feePct) / 100)} in fees` : ''}`,
    time: '20 min',
  });
  steps.push({
    text: `Check its docs or app for a points, XP or season page and register for it, adding a referral code from its official channels only; screenshot your balance so the snapshot can be checked later.`,
    cost: 'free (a signature, no gas)',
    time: '10 min',
  });
  if (p.chains.length > 1) {
    const second = p.chains.find((c) => c !== chain) ?? chain;
    steps.push({
      text: `Repeat a smaller position (about ${usd(size / 4)}) on ${second}: many launches reward use across several of a protocol's ${p.chains.length} chains.`,
      cost: gasRange(GAS_USD[second] ?? OTHER_GAS, a.txs + 1),
      time: '20 min',
    });
  }
  steps.push({
    text: hot
      ? `TVL rose ${p.change_7d!.toFixed(1)}% in 7 days, so the queue is forming now: top up within the week and interact at least twice a week.`
      : cold
        ? `TVL fell ${Math.abs(p.change_7d!).toFixed(1)}% in 7 days: enter at half size first and add the rest only once the outflow stops for a week.`
        : `Interact once a week (a claim, a compound or a small top-up) so the wallet shows steady activity rather than one deposit.`,
    cost: `${gasRange(gas, 1)} a week`,
    time: '5 min a week',
  });
  steps.push({
    text: `Hold the position for at least ${weeks} weeks; ${days === null ? 'DefiLlama records no listing date' : `it has run ${days} days with no token recorded`}, so plan for the season to last at least that long.`,
    cost: `capital locked: ${usd(size)}`,
    time: `${weeks} weeks`,
  });
  steps.push({
    text: `Set an exit rule before you need it: withdraw if TVL drops 30% in a week, the team announces no token, or you see signs of ${a.risk}; a token is never guaranteed.`,
    cost: `${gasRange(gas, 2)} to exit`,
    time: '10 min',
  });
  return steps;
}

/** The gate's string form of a step: action, then cost and time. */
export function stepString(s: FarmStep): string {
  return `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
}
