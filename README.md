# Token Launch Radar

A radar of DeFi protocols that record no token yet. Each one is valued from the record of its
peers: what its token would be worth if it launched, times the odds that protocols like it record
a token. Every protocol also gets a costed farm verdict and a step-by-step plan.

Both models are fitted on the snapshot alone and tested on protocols they did not see. A term
stays in a model only if it lowers the held-out error in both tests.

- `main.ts` (Node 22+, standard library only) reads `/input/snapshot.json` and writes
  `/output/board.json`, `/output/data.js`, the dashboard, its screenshots and `dossier.json`. Before
  it writes anything, it checks the board against the gate's rules and that all 758 protocols are
  accounted for.
- `lib/fit.ts` holds the fitted models.
  - **Cap model:** ridge regression of log(market cap / TVL) over the protocols whose token trades.
    It is tested two ways: leave-one-out, and walk-forward (fit on the earliest-listed 60%, predict
    the rest).
  - **Token odds:** logistic regression of "records a token", scored by its Brier score against the
    base rate.
  - Each candidate term is shown with both held-out scores, including the ones that were dropped.
- `lib/model.ts`: implied value = TVL × fitted cap/TVL × token odds. Its P25–P75 and P10–P90 ranges
  come from the cap model's own held-out misses, and the page reports how often real caps fell
  inside them.
- `lib/verdict.ts` gives the farm verdict: modelled drop vs gas, fees and a T-bill on the same
  money. The result is FARM, MARGINAL or SKIP, with net per hands-on hour and a sensitivity grid.
- `lib/farm.ts` builds a plan of 5–7 steps for each protocol, with every step's cost and time.
- `dashboard/` is a static page with no network access. It has:
  - an evidence strip and a protocol-accounting bar;
  - a sortable, filterable board;
  - a full detail view for each protocol, showing how the figure is made, the verdict and its
    grid, the nearest priced peers and the plan;
  - the full evidence tables and the live-token peer set.

Run locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Screenshots are stored as base64 text in `screenshots/*.jpg.b64`, and `main.ts` decodes them into
`/output/screenshots/`.

Implied values are this radar's own estimates from public TVL data. They are not financial advice,
and they are not a prediction that any protocol will issue a token.

License: MIT.
