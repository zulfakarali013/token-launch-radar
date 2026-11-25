// Token Launch Radar v3: farm plans.
//
// Every board row gets an 8-step plan on a timeline (Day 0, weekly, any day, the exit day, the
// budget), and every step names its cost in dollars and its time in minutes, so the plan adds up to
// one bill and one number of hands-on hours. The plan is built from the row's own record: its category
// picks the action, its cheapest listed chain sets the gas, its TVL sizes the deposit and sets the
// exit line, its days without a token set the hold, and the verdict (lib/verdict.ts) prices it.

import type { Protocol, Valuation } from './model.ts';

export interface FarmStep {
  when: string;
  text: string;
  cost_usd: number;
  minutes: number;
}

/** Typical cost of one transaction on a chain, in US dollars (low end, high end). */
const GAS_USD: Record<string, [number, number]> = {
  Ethereum: [1.5, 6],
  Bitcoin: [1, 4],
  Solana: [0.005, 0.03],
  Arbitrum: [0.03, 0.2],
  Base: [0.02, 0.1],
  Optimism: [0.03, 0.2],
  BSC: [0.05, 0.2],
  Binance: [0.05, 0.2],
  Mantle: [0.01, 0.05],
  Starknet: [0.02, 0.1],
  'zkSync Era': [0.03, 0.15],
  Polygon: [0.01, 0.05],
  Avalanche: [0.05, 0.3],
  Sui: [0.01, 0.04],
  Aptos: [0.01, 0.04],
  'Hyperliquid L1': [0.01, 0.05],
  TON: [0.02, 0.08],
  Tron: [0.5, 2],
};
const OTHER_GAS: [number, number] = [0.05, 0.4];
const gasMid = (g: [number, number]) => Math.round(((g[0] + g[1]) / 2) * 1000) / 1000;

export function cheapestChain(chains: string[]): { chain: string; gas_tx_usd: number } {
  const list = chains.length ? chains : ['Ethereum'];
  let best = { chain: list[0]!, gas_tx_usd: gasMid(GAS_USD[list[0]!] ?? OTHER_GAS) };
  for (const c of list) {
    const g = gasMid(GAS_USD[c] ?? OTHER_GAS);
    if (g < best.gas_tx_usd) best = { chain: c, gas_tx_usd: g };
  }
  return best;
}

type Action = { verb: string; what: string; txs: number; fee_pct: number; risk: string };

function actionFor(category: string | null): Action {
  switch (category) {
    case 'Dexs':
    case 'DEX Aggregator':
      return { verb: 'Provide liquidity and swap', what: 'add liquidity to its deepest stablecoin pool and swap through it once', txs: 3, fee_pct: 0.1, risk: 'the pool losing its peg' };
    case 'Derivatives':
    case 'Interest Rate Derivatives':
    case 'Prediction Market':
    case 'Options':
      return { verb: 'Trade small and keep collateral in', what: 'deposit into its liquidity vault and place one small, hedged trade', txs: 4, fee_pct: 0.1, risk: 'liquidation or vault losses' };
    case 'Lending':
    case 'Uncollateralized Lending':
    case 'Collateral Markets':
      return { verb: 'Supply and borrow', what: 'supply a stablecoin and borrow a little against it (loan-to-value under 30%)', txs: 3, fee_pct: 0, risk: 'bad debt or a collateral depeg' };
    case 'CDP':
    case 'CDP Manager':
      return { verb: 'Mint against collateral', what: 'open a vault, post collateral and mint a little of its stablecoin (collateral ratio over 250%)', txs: 3, fee_pct: 0, risk: 'liquidation or a depeg' };
    case 'RWA':
    case 'Basis Trading':
    case 'Dual-Token Stablecoin':
    case 'Stablecoin Wrapper':
    case 'Synthetics':
      return { verb: 'Mint its yield-bearing dollar', what: 'mint or buy its yield-bearing dollar with USDC and stake it in its own contract', txs: 3, fee_pct: 0.1, risk: 'a depeg or a redemption queue' };
    case 'Liquidity Manager':
    case 'Leveraged Farming':
      return { verb: 'Deposit into a managed vault', what: 'deposit into its largest stablecoin or blue-chip vault and leave the manager to rebalance it', txs: 3, fee_pct: 0.1, risk: 'a rebalance loss or a depeg' };
    case 'Yield':
    case 'Yield Aggregator':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return { verb: 'Deposit into a vault', what: 'deposit USDC into its largest stablecoin vault and leave it compounding', txs: 2, fee_pct: 0, risk: 'a curator loss or a withdrawal queue' };
    default:
      return { verb: 'Use it', what: 'deposit into its main product and leave it working', txs: 2, fee_pct: 0, risk: 'smart-contract risk in a young product' };
  }
}

export const PLAN = {
  deposit_share_of_tvl: 0.0005, // the plan's own deposit: 0.05% of TVL...
  deposit_min_usd: 1_000, // ...never under $1,000...
  deposit_max_usd: 25_000, // ...never over $25,000
  exit_drawdown: 0.3, // leave if TVL falls 30% below the snapshot
  weekly_minutes: 5,
};

export interface PlanSummary {
  deposit_usd: number;
  chain: string;
  gas_tx_usd: number;
  setup_txs: number; // fund, test, enter
  exit_txs: number;
  weeks: number;
  setup_minutes: number; // every minute that is not weekly
  fee_pct: number; // swap and mint fees, of the deposit, in and out
  verb: string;
}

export function depositFor(p: Protocol): number {
  return Math.max(PLAN.deposit_min_usd, Math.min(PLAN.deposit_max_usd, Math.round((p.tvl_usd * PLAN.deposit_share_of_tvl) / 500) * 500));
}

export function holdWeeks(v: Valuation): number {
  const d = v.days_without_token;
  return d === null ? 12 : d > 730 ? 8 : d > 365 ? 12 : d > 120 ? 16 : 20;
}

const STEP_MIN = { verify: 20, fund: 15, enter: 25, register: 10, exit_rule: 5, exit: 20 };

export function planSummary(p: Protocol, v: Valuation): PlanSummary {
  const { chain, gas_tx_usd } = cheapestChain(p.chains);
  const a = actionFor(p.category);
  return {
    deposit_usd: depositFor(p),
    chain,
    gas_tx_usd,
    setup_txs: 1 + 2 + a.txs,
    exit_txs: 2,
    weeks: holdWeeks(v),
    setup_minutes: STEP_MIN.verify + STEP_MIN.fund + STEP_MIN.enter + STEP_MIN.register + STEP_MIN.exit_rule + STEP_MIN.exit,
    fee_pct: a.fee_pct,
    verb: a.verb,
  };
}

const usd = (x: number) => (Math.abs(x) >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : `$${x.toFixed(2)}`);
const big = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1e3)}K`);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The plan, step by step; `net` is the verdict's figure for the plan's own deposit, share and hold. */
export function farmPlan(p: Protocol, v: Valuation, s: PlanSummary, net: { drop_usd: number; cost_usd: number; net_usd: number; hours: number; per_hour_usd: number; call: string }): FarmStep[] {
  const a = actionFor(p.category);
  const g = s.gas_tx_usd;
  const d = s.deposit_usd;
  const fee = (d * a.fee_pct) / 100;
  const exitLine = p.tvl_usd * (1 - PLAN.exit_drawdown);
  const days = v.days_without_token;
  const trend = (p.change_7d ?? 0) <= -10 ? ` TVL fell ${Math.abs(p.change_7d!).toFixed(1)}% this week, so enter half now and the rest after a flat week.` : (p.change_7d ?? 0) >= 10 ? ` TVL rose ${p.change_7d!.toFixed(1)}% this week: the queue is forming, enter now.` : '';
  return [
    { when: 'Day 0', text: `Verify before funding: open ${p.name} from its DefiLlama page (never a search ad), confirm TVL near ${big(p.tvl_usd)} and that it still records no token, then read its audit and withdrawal terms.`, cost_usd: 0, minutes: STEP_MIN.verify },
    { when: 'Day 0', text: `Fund a wallet used for nothing else on ${s.chain} (its cheapest listed chain) with ${usd(d)} of USDC plus gas, withdrawn from an exchange (1 transaction).`, cost_usd: r2(g), minutes: STEP_MIN.fund },
    { when: 'Day 0', text: `${a.verb}: put a $50 test through and take it back, then ${a.what} with ${usd(d)} (${a.txs + 2} transactions${a.fee_pct ? `, ${a.fee_pct}% in fees` : ''}).${trend}`, cost_usd: r2(g * (a.txs + 2) + fee), minutes: STEP_MIN.enter },
    { when: 'Day 1', text: `Register the wallet on its points or rewards page if it has one and note the balance; a stake the page does not show is not counted.`, cost_usd: 0, minutes: STEP_MIN.register },
    { when: `Weekly x${s.weeks}`, text: `Once a week for ${s.weeks} weeks make one small transaction (claim, compound or top up) and log the balance and its TVL, so the wallet shows steady use rather than one deposit.`, cost_usd: r2(g * s.weeks), minutes: PLAN.weekly_minutes * s.weeks },
    { when: 'Any day', text: `Exit rule: withdraw if TVL falls under ${big(exitLine)} (30% below the snapshot), withdrawals pause, there are signs of ${a.risk}, or a token is announced with nothing for depositors. Claim only from a link ${p.name} itself publishes.`, cost_usd: 0, minutes: STEP_MIN.exit_rule },
    { when: `Day ${s.weeks * 7}`, text: `Exit: withdraw and send the USDC back to the exchange (2 transactions${a.fee_pct ? `, ${a.fee_pct}% in fees` : ''}); ${days === null ? 'it has no listing date' : `by then it will have gone ${days + s.weeks * 7} days without a token`}, so re-check before staying longer.`, cost_usd: r2(g * 2 + fee), minutes: STEP_MIN.exit },
    { when: 'Budget', text: `${usd(net.cost_usd)} of gas, fees and forgone 4% T-bill on ${usd(d)} for ${s.weeks} weeks, against a modelled drop of ${usd(net.drop_usd)}: net ${net.net_usd >= 0 ? '+' : '-'}${usd(Math.abs(net.net_usd))}, ${net.per_hour_usd >= 0 ? '+' : '-'}${usd(Math.abs(net.per_hour_usd))} an hour over ${net.hours.toFixed(1)} h: ${net.call}.`, cost_usd: 0, minutes: 0 },
  ];
}

/** The gate's string form of a step: when, action, then cost and time. */
export function stepString(s: FarmStep): string {
  const t = s.minutes >= 60 ? `${(s.minutes / 60).toFixed(1)} h` : `${s.minutes} min`;
  return s.when === 'Budget' ? `Budget: ${s.text}` : `${s.when}: ${s.text} Cost: ${usd(s.cost_usd)}. Time: ${t}.`;
}
