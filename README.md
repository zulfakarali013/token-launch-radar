# Token Launch Radar

A radar of DeFi protocols that record no token yet. Each one is valued from the record of its
peers: what its token would be worth if it launched, times the odds that protocols like it record
a token. Every protocol also gets a timed, costed farm plan and a verdict in dollars per hour.

Both models are fitted on the snapshot alone and tested on protocols they did not see. A term
stays in a model only if it lowers the held-out error in both blind tests.

- `main.ts` (Node 22+, standard library only) reads `/input/snapshot.json` and writes
  `/output/board.json`, `/output/data.js`, the dashboard, its screenshots and `dossier.json`.
  Before it writes anything it checks the board against the gate's rules, that every snapshot
  protocol sits in exactly one group, that each verdict agrees with the verdict formula, and it
  scans its own code and the page for any protocol name (the count is printed on the cover: 0).
- `lib/model.ts` sorts all 758 protocols into one group each (watchlist, off-list, traded
  comparables, token on record, bridge, staked form, exchange custody, wrapper or version, chain,
  kin of a token), by category and name shape alone. Comparables are stand-alone traded tokens
  only, so a staked or bridged form never prices a launch.
- `lib/fit.ts` holds the fitted models.
  - **Value if a token launches:** regression of ln(market cap / TVL) over the 88 stand-alone
    traded tokens. Tested leave-one-out and walk-forward (fit on the earliest-listed 60%, price the
    newer 40%); ten-fold is reported beside them and never used to pick. The whole term search runs
    twice, with least squares and with a Huber loss (delta 1.5 log units, set before the search), and
    the loss whose final model is better in both blind tests is used. On this snapshot that is Huber
    with size, 7-day growth and chain count: typical miss x3.06 left out, x2.11 walk-forward, against
    x3.25 / x2.70 for least squares and x4.61 / x4.71 for a flat multiple.
  - **Token odds:** penalised logistic regression of "records a token", scored by Brier against the
    base rate, ten-fold and walk-forward. Years listed, category token share and size survived. A
    category's share is learned inside each training split only.
  - **Bootstrap:** 200 seeded refits give each coefficient a standard error and each row the range
    of ranks it takes when the data are redrawn.
- `lib/verdict.ts`: modelled drop (odds x value if it launches x drop share x deposit share of
  the pool) against gas for every transaction, fees in and out, and a 4% T-bill on the same money.
  FARM, MARGINAL or SKIP, with net per hands-on hour, a grid over drop share and deposit, and net
  by weeks held.
- `lib/farm.ts`: an 8-step plan per protocol on a timeline (verify, fund, test and enter,
  register, weekly, exit rule, exit, budget), each step with its cost in dollars and its minutes.
- `dashboard/`: a static page, no network. Evidence strip, protocol ledger with live checks, the
  formula with its fitted coefficients, the held-out tables and range honesty, a cap-on-TVL chart,
  a sortable, filterable board with rank ranges and inline plans, what-if controls (deposit, drop
  share, hold, T-bill) that reprice every verdict, CSV and JSON export, a full page per protocol
  (how the figure is made, comparables priced blind, what moves the value, the plan, the grids),
  the method, and the comparables. The page recomputes every value and verdict and shows the match.

Run locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Screenshots are stored as base64 text in `screenshots/*.jpg.b64`, and `main.ts` decodes them into
`/output/screenshots/`.

Implied values are this radar's own estimates from public TVL data. They are not financial advice,
and they are not a prediction that any protocol will issue a token.

License: MIT.
