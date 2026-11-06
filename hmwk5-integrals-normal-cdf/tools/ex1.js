"use strict";

// Prints the numbers of Exercise 1 from the command line.
// usage: node tools/ex1.js

const I = require("../integrals.js");

const NS = [3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383];

function slope(ns, errs) {
  const pts = ns.map((n, i) => [Math.log(n), Math.log(errs[i])]).filter((p) => Number.isFinite(p[1]));
  if (pts.length < 2) return NaN;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return num / den;
}

function time(fn, reps) {
  const t0 = process.hrtime.bigint();
  let s = 0;
  for (let r = 0; r < reps; r++) s += fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / reps;
}

console.log("Si(pi) =", I.siPi());
for (const fn of I.FUNCTIONS) {
  console.log(`\n${fn.label}   exact ${fn.exact}`);
  console.log("     N |  R right err |  R mid err   |  L lower err |  L mid err");
  const errs = { rr: [], rm: [], ll: [], lm: [] };
  for (const N of NS) {
    const e = {
      rr: Math.abs(I.riemann(fn, N, "right") - fn.exact),
      rm: Math.abs(I.riemann(fn, N, "mid") - fn.exact),
      ll: Math.abs(I.lebesgue(fn, N, "lower") - fn.exact),
      lm: Math.abs(I.lebesgue(fn, N, "mid") - fn.exact),
    };
    for (const k in e) errs[k].push(e[k]);
    console.log(String(N).padStart(6), "|", ...Object.values(e).map((v) => v.toExponential(3).padStart(11) + " |"));
  }
  const big = NS.slice(4);
  const sl = (k) => slope(big, errs[k].slice(4)).toFixed(2);
  console.log(`slopes (N >= 63): right ${sl("rr")}  mid ${sl("rm")}  lower ${sl("ll")}  Lmid ${sl("lm")}`);
  const N = 4095;
  console.log(`time N=${N} (ms): riemann mid ${time(() => I.riemann(fn, N, "mid"), 200).toFixed(4)}  lebesgue mid ${time(() => I.lebesgue(fn, N, "mid"), 200).toFixed(4)}`);
}

console.log("\ncounted Lebesgue (N = 1000 levels) vs Riemann midpoint with M points");
for (const key of ["sin", "sq", "sinc"]) {
  const fn = I.FUNCTIONS.find((f) => f.key === key);
  for (const M of [100, 1000, 10000, 100000]) {
    const c = I.lebesgueCounted(fn, 1000, M), r = I.riemann(fn, M, "mid");
    console.log(key, M, "counted err", Math.abs(c - fn.exact).toExponential(3), "riemann err", Math.abs(r - fn.exact).toExponential(3), "diff", Math.abs(c - r).toExponential(3));
  }
}

console.log("\nThomae");
console.log("     N | R right   | R mid     | upper Darboux | float tags (mid)");
for (const N of [10, 100, 1000, 3000, 10000]) {
  let fl = 0;
  for (let k = 0; k < N; k++) fl += I.thomaeFloat((2 * k + 1) / (2 * N));
  console.log(String(N).padStart(6), I.thomaeRiemann(N, "right").toExponential(3), I.thomaeRiemann(N, "mid").toExponential(3), I.thomaeUpper(N).toExponential(3), (fl / N).toExponential(3));
}
