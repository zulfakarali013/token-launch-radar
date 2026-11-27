// Cap on TVL scatter with fitted curve and P25-P75 band.
'use strict';
function scatter(hi, W, H) {
  var lx = function (v) { return 24 + (LN(v) - LN(3e6)) / (LN(5e10) - LN(3e6)) * (W - 30); };
  var ly = function (v) { return H - 14 - (LN(Math.max(v, 1e4)) - LN(1e4)) / (LN(5e10) - LN(1e4)) * (H - 22); };
  var lab = function (t) { return m(t).replace('.00', '').replace('.0', ''); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL">';
  [1e7, 1e8, 1e9, 1e10].forEach(function (t) { s += '<line class="ax" x1="' + lx(t) + '" x2="' + lx(t) + '" y1="4" y2="' + (H - 14) + '"/><text x="' + (lx(t) - 10) + '" y="' + (H - 3) + '">' + lab(t) + '</text>'; });
  [1e5, 1e7, 1e9].forEach(function (t) { s += '<text x="0" y="' + (ly(t) + 3) + '">' + lab(t) + '</text>'; });
  var line = '', up = [], dn = [];
  for (var t = 3e6; t <= 5e10; t *= 1.6) {
    var c = t * Math.exp(C.w[0] + C.w[1] * LN(t / 1e8)), x = lx(t).toFixed(1);
    line += (line ? 'L' : 'M') + x + ' ' + ly(c).toFixed(1);
    up.push(x + ' ' + ly(c * Math.exp(C.bands.p75)).toFixed(1)); dn.unshift(x + ' ' + ly(c * Math.exp(C.bands.p25)).toFixed(1));
  }
  s += '<path d="M' + up.join('L') + 'L' + dn.join('L') + 'Z" fill="#5b5ef0" opacity=".12"/>';
  D.rows.forEach(function (r) { s += '<circle cx="' + lx(r.tvl).toFixed(1) + '" cy="' + ly(r.v.value_if_launch_usd).toFixed(1) + '" r="1.6" fill="#7b7de8" opacity=".55"/>'; });
  D.live.forEach(function (q) { s += '<circle cx="' + lx(q.tvl).toFixed(1) + '" cy="' + ly(q.mc).toFixed(1) + '" r="2" fill="#e0a526" opacity=".85"/>'; });
  s += '<path d="' + line + '" stroke="#e8ebf2" stroke-width="1.3" fill="none"/>';
  if (hi) s += '<circle cx="' + lx(hi.tvl) + '" cy="' + ly(hi.v.value_if_launch_usd) + '" r="5" fill="none" stroke="#ff5964" stroke-width="2"/>';
  return s + '</svg>';
}
