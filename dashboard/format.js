// Formatting helpers shared by every view. No state, no data.
'use strict';
var $ = function (id) { return document.getElementById(id); };
var LN = Math.log;
function m(x) {
  var a = Math.abs(x), s = x < 0 ? '-' : '';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return s + '$' + Math.round(a / 1e3) + 'K';
  if (a >= 100) return s + '$' + Math.round(a).toLocaleString('en-US');
  return s + '$' + a.toFixed(2);
}
function sg(x) { return (x >= 0 ? '+' : '-') + m(Math.abs(x)); }
function pct(x, d) { return (x * 100).toFixed(d == null ? 0 : d) + '%'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function age(d) { return d == null ? 'no date' : d < 60 ? d + ' d' : d < 365 ? Math.round(d / 30.4) + ' mo' : (d / 365.25).toFixed(1) + ' y'; }
function x2(x) { return '\u00d7' + x.toFixed(2); }
function cls(x) { return x >= 0 ? 'pos' : 'neg'; }
function d7s(x) { return x == null ? '\u2013' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; }
function med(xs) { xs = xs.slice().sort(function (a, b) { return a - b; }); var n = xs.length; return n ? (n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2) : 0; }
function callTag(c) { return '<span class="call ' + c + '">' + c + '</span>'; }
