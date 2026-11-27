// Fitted model from main.ts's coefficients, checked against board.json.
'use strict';
var D = window.RADAR, V = D.verdict, C = D.cap, O = D.odds, K = D.checks;
var asOf = Date.parse(D.as_of + 'T00:00:00Z');
function years(r) { return r.l ? Math.max(0, (asOf - Date.parse(r.l + 'T00:00:00Z')) / (365.25 * 864e5)) : 1.5; }
function col(key, r, table) {
  var s = LN(r.tvl / 1e8), g = Math.tanh((r.d7 == null ? 0 : r.d7) / 20), y = LN(1 + years(r));
  if (key === 'size') return s;
  if (key === 'growth') return g;
  if (key === 'age') return y;
  if (key === 'chains') return LN(Math.max(1, r.ch.length));
  if (key === 'size2') return s * s;
  if (key === 'agesize') return y * s;
  if (key === 'age2') return y * y;
  if (key === 'multi') return r.ch.length >= 3 ? 1 : 0;
  if (key === 'swing') return Math.abs(g);
  if (key === 'eth') return r.ch.indexOf('Ethereum') >= 0 ? 1 : 0;
  if (key === 'young') return years(r) < 1 ? 1 : 0;
  if (key === 'sizeg') return s * g;
  if (key === 'knn') return knn(r);
  return (table && table[r.c == null ? 'Uncategorised' : r.c]) || 0;
}
function r4(x) { return Math.round(x * 1e4) / 1e4; }
function r2(x) { return Math.round(x * 100) / 100; }
function lgt(p) { return LN(p / (1 - p)); }
// nearest-peer token share of the k closest (own row out)
function knn(r) {
  var k = O.peers_k, b = O.peers_base, x = r4(LN(r.tvl / 1e8) / 2), z = r4(LN(1 + years(r)) / 0.5);
  var d = O.peers.filter(function (v) { return v[3] !== r.s; }).map(function (v) { return [Math.pow(v[0] - x, 2) + Math.pow(v[1] - z, 2), v[2], v[3]]; });
  d.sort(function (a, c) { return a[0] - c[0] || (a[2] < c[2] ? -1 : a[2] > c[2] ? 1 : 0); });
  var t = 0; for (var i = 0; i < k; i++) t += d[i][1];
  return lgt((t + 2 * b) / (k + 2)) - lgt(b);
}
function score(mod, r) { var z = mod.w[0]; for (var j = 0; j < mod.keys.length; j++) z += mod.w[j + 1] * col(mod.keys[j], r, mod.table); return z; }
function impliedValue(r) {
  var ifl = r.tvl * Math.exp(score(C, r)), o = 1 / (1 + Math.exp(-score(O, r)));
  return { ifl: ifl, o: o, iv: Math.max(1, Math.round(ifl * o)) };
}
// netFor (lib/verdict.ts) at any deposit, share, hold, T-bill
function farmPlan(r, dep, sh, wk, tb, v) {
  var ps = r.ps; v = v || { o: r.v.odds, ifl: r.v.value_if_launch_usd };
  var drop = v.o * v.ifl * sh * (dep / (r.tvl + dep));
  var gas = ps.gas_tx_usd * (ps.setup_txs + wk + ps.exit_txs);
  var fees = dep * ((2 * ps.fee_pct) / 100 + V.base_fee_rate);
  var bill = (dep * tb * wk * 7) / 365;
  var cost = gas + fees, net = drop - cost, beat = net - bill;
  var hours = (ps.setup_minutes + V.weekly_minutes * wk) / 60, ph = net / hours;
  return { drop: drop, gas: gas, fees: fees, bill: bill, cost: cost, net: net, beat: beat, hours: hours, ph: ph, call: beat / hours >= V.hourly_bar_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP' };
}
// record moved: TVL t%, 7-day g pts, mo more months without a token
function moved(r, t, g, mo) {
  var q = Object.assign({}, r, { tvl: r.tvl * (1 + t / 100), d7: (r.d7 == null ? 0 : r.d7) + g });
  if (mo && r.l) q.l = new Date(Date.parse(r.l + 'T00:00:00Z') - Math.round(mo * 182 / 6) * 864e5).toISOString().slice(0, 10);
  return q;
}
var same = 0, sameV = 0;
D.rows.forEach(function (r) {
  if (impliedValue(r).iv === r.v.implied_value_usd) same++;
  if (r2(farmPlan(r, r.ps.deposit_usd, V.drop_share, r.ps.weeks, V.tbill_rate).net) === r.vd.net_usd) sameV++;
});
// what-if rows from main.ts, via moved()
var sameS = 0, nS = 0;
D.rows.forEach(function (r) {
  [[-30, 0, 0], [100, 0, 0], [0, null, 0], [0, 0, 6]].forEach(function (a, i) {
    var s = r.sv[i]; if (!s) return; nS++;
    var q = a[1] === null ? Object.assign({}, r, { d7: 0 }) : moved(r, a[0], a[1], a[2]);
    if (Math.abs(impliedValue(q).iv / s.iv - 1) < 1e-3) sameS++;
  });
});
