// Sandbox: move the record and the plan, never the coefficients; at zero it equals board.json.
'use strict';
function sandbox(r) {
  var q = moved(r, S.xt, S.xg, S.xm), a = impliedValue(r), b = impliedValue(q), st = settings(r);
  var fa = farmPlan(r, r.ps.deposit_usd, V.drop_share, r.ps.weeks, V.tbill_rate), fb = farmPlan(q, st.dep, st.sh, st.wk, st.tb, b);
  var dirty = S.xt || S.xg || S.xm || !plain();
  var sl = function (k, lab, min, max, step, unit) { return '<label>' + lab + ' <input type="range" data-x="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + S[k] + '" aria-label="' + lab + '"><b>' + (S[k] > 0 ? '+' : '') + S[k] + unit + '</b></label>'; };
  var line = function (lab, x, y, f, good) { var d = y - x; return '<tr><td>' + lab + '</td><td class="num">' + f(x) + '</td><td class="num"><b>' + f(y) + '</b></td><td class="num ' + (Math.abs(d) < 1e-9 ? 'faint' : (d > 0) === good ? 'pos' : 'neg') + '">' + (Math.abs(d) < 1e-9 ? '=' : (d > 0 ? '\u25b2 ' : '\u25bc ') + f(Math.abs(d))) + '</td></tr>'; };
  return '<h2>Sandbox: change the record, the fitted model reprices <code>moved()</code> <button class="lnk" data-sbreset="1"' + (dirty ? '' : ' disabled') + '>Reset to fitted</button></h2>' +
    '<div class="sbin">' + sl('xt', 'TVL', -50, 100, 10, '%') + sl('xg', '7-day change', -20, 20, 1, ' pts') + sl('xm', 'More months, no token', 0, 24, 3, ' mo') + sl('sh', 'Drop share', 1, 20, 0.5, '%') +
    '<label>Deposit <select data-x="dep">' + ['plan'].concat(V.grid_deposits, [100000]).map(function (d) { return '<option value="' + d + '"' + (String(S.dep) === String(d) ? ' selected' : '') + '>' + (d === 'plan' ? 'plan ' + m(r.ps.deposit_usd) : m(d)) + '</option>'; }).join('') + '</select></label>' +
    '<label>Hold <select data-x="wk">' + ['plan', 4, 8, 13, 26, 52].map(function (w) { return '<option value="' + w + '"' + (String(S.wk) === String(w) ? ' selected' : '') + '>' + (w === 'plan' ? 'plan ' + r.ps.weeks + ' wk' : w + ' wk') + '</option>'; }).join('') + '</select></label></div>' +
    '<table class="t"><tr><th>At</th><th class="num">Fitted record, plan</th><th class="num">Your sandbox</th><th class="num">Change</th></tr>' +
    line('TVL', r.tvl, q.tvl, m, true) +
    line('Value if a token launches', a.ifl, b.ifl, m, true) +
    line('Token odds (peers like it)', a.o * 100, b.o * 100, function (x) { return x.toFixed(1) + '%'; }, true) +
    line('Implied value', a.iv, b.iv, m, true) +
    line('Expected drop on the deposit', fa.drop, fb.drop, m, true) +
    line('Gas and fees', fa.cost, fb.cost, m, false) +
    line('Net, after a ' + S.tb + '% T-bill', fa.beat, fb.beat, sg, true) +
    line('Net per hour of work', fa.ph, fb.ph, sg, true) +
    '<tr class="kept"><td>Verdict</td><td class="num">' + callTag(fa.call) + '</td><td class="num">' + callTag(fb.call) + '</td><td class="num">' + (fa.call === fb.call ? '=' : fa.call + ' \u2192 ' + fb.call) + '</td></tr></table>' +
    '<p class="note">Only the record and the plan move, never the coefficients. More months move the listing date back' + (r.l ? '' : '; no listing date here, so years hold at 1.5') + '.</p>';
}
