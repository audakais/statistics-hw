"use strict";

// Prints the numbers of the page from the command line, same seeds.
// usage: node tools/experiments.js [distribution] [m]

const W = require("../welford.js");

const name = process.argv[2] || "skewed";
const m = parseInt(process.argv[3] || "2000", 10);
const pmf = W.DISTRIBUTIONS[name].pmf;
const mom = W.moments(pmf);
const SIZES = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];
const T975 = { 2: 12.706, 5: 2.776, 10: 2.262, 20: 2.093, 50: 2.010, 100: 1.984, 200: 1.972, 500: 1.965, 1000: 1.962, 5000: 1.960 };

console.log(`${name}: mu=${mom.mu.toFixed(4)} sigma2=${mom.sigma2.toFixed(4)} skew=${mom.skewness.toFixed(4)} kurt=${mom.kurtosis.toFixed(4)}`);
console.log("     n |  avg M  z(M) |  avg s2 z(s2) | avg biased | avg s | sd(M) th | sd(s2) th | cov th | cover");
const rows = SIZES.map((n) => W.experiment(pmf, m, n, 1000 + n, T975[n]));
for (const r of rows) {
  console.log(
    String(r.n).padStart(6) + " | " +
    r.avgMean.toFixed(4) + " " + r.zMean.toFixed(2).padStart(5) + " | " +
    r.avgVar.toFixed(4) + " " + r.zVar.toFixed(2).padStart(5) + " | " +
    r.avgBiased.toFixed(4) + " | " + r.avgSd.toFixed(4) + " | " +
    Math.sqrt(r.varMean).toFixed(4) + " " + Math.sqrt(r.th.varMean).toFixed(4) + " | " +
    Math.sqrt(r.varS2).toFixed(4) + " " + Math.sqrt(r.th.varS2).toFixed(4) + " | " +
    r.cov.toFixed(4) + " " + r.th.covMeanS2.toFixed(4) + " | " + r.coverage.toFixed(3)
  );
}
const big = rows.filter((r) => r.n >= 10);
console.log("slope sd(M):", W.logLogSlope(big.map((r) => r.n), big.map((r) => Math.sqrt(r.varMean))).toFixed(3));
console.log("slope sd(s2):", W.logLogSlope(big.map((r) => r.n), big.map((r) => Math.sqrt(r.varS2))).toFixed(3));

// numerical stability: 10000 integer scores 0..10 shifted by a large offset
console.log("\noffset | exact SS | naive error | Welford error | two-pass error (relative)");
const rand = W.rng(7);
const base = Array.from({ length: 10000 }, () => Math.floor(rand() * 11));
for (const off of [0, 1e4, 1e6, 1e7, 1e8, 1e9, 1e12]) {
  const xs = base.map((x) => x + off);
  const exact = W.exactSS(xs);
  const st = W.newStats();
  xs.forEach((x) => W.push(st, x));
  const err = (v) => Math.abs(v - exact) / exact;
  console.log(off, exact.toFixed(4), err(W.naiveSS(xs)).toExponential(2), err(st.SS).toExponential(2), err(W.batchSS(xs)).toExponential(2));
}
