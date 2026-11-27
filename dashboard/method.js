// Method and comparables tabs, from the cover's fitted objects.
'use strict';
function method() {
  // notes from main.ts; integrity recomputed here
  $('method').innerHTML = '<div class="card evid">' + evidence() + '</div><div class="card method"><h2>Method and tests</h2>' +
    D.method_notes.map(function (n) { return '<p><b>' + esc(n[0]) + '.</b> ' + esc(n[1]) + '</p>'; }).join('') +
    '<p><b>Integrity.</b> This page recomputes every value and verdict of board.json (' + same + '/' + D.rows.length + ') and names ' + K.names_in_code + ' protocols in code.</p></div>';
}
function comps() {
  var rows = D.live.map(function (q) { var x = q.mc / q.b; return '<tr><td>' + esc(q.n) + ' <span class="faint">' + esc(q.sy || '') + '</span></td><td class="mut">' + esc(q.c) + '</td><td class="num">' + (q.l || '\u2013') + '</td><td class="num">' + m(q.tvl) + '</td><td class="num">' + m(q.mc) + '</td><td class="num">' + (q.mc / q.tvl).toFixed(3) + '</td><td class="num">' + m(q.b) + '</td><td class="num ' + (Math.abs(LN(x)) < LN(3) ? 'pos' : 'neg') + '">' + x2(x) + '</td></tr>'; }).join('');
  $('comps').innerHTML = '<div class="card"><h2>The ' + D.live.length + ' comparables: stand-alone tokens that trade</h2><table class="t"><tr><th>Token</th><th>Category</th><th class="num">Listed</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th><th class="num">Blind price</th><th class="num">Real / blind</th></tr>' + rows + '</table><p class="note">Blind price: the curve fitted on the other ' + (D.live.length - 1) + '. Green: within \u00d73. None is on the board.</p></div>';
}
