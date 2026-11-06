"use strict";

// Prints the numbers of Exercise 2 from the command line.
// usage: node tools/ex2.js

const C = require("../normcdf.js");

const POINTS = ["-8", "-5", "-3", "-1.96", "-1", "-0.5", "0", "0.5", "1", "1.645", "1.96", "2", "2.576", "3", "4", "5", "6", "8", "10", "20"];

console.log("reference values (30 significant digits)");
const ref = {};
for (const xs of POINTS) {
  const r = C.reference(xs);
  ref[xs] = { p: C.significant(r.p, 30), q: C.significant(r.q, 30) };
  console.log(xs.padStart(6), "Phi", ref[xs].p.text, "  1-Phi", ref[xs].q.text);
}

// the 68-95-99.7 table on Wikipedia gives P(|Z| < k) to 15 decimals
console.log("\nP(|Z| < k) = 1 - 2 Q(k) from the reference, to compare with the web table");
for (const k of ["0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8"]) {
  const r = C.reference(k, 120);
  const S = 10n ** 120n;
  const q = BigInt(r.q.replace(".", ""));
  const inside = S - 2n * q;
  console.log(k.padStart(4), "0." + inside.toString().padStart(120, "0").slice(0, 18), "  outside", C.significant("0." + (2n * q).toString().padStart(120, "0"), 6).text);
}

const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

console.log("\nrelative errors of Phi(x) and of 1 - Phi(x)");
const methods = {
  simpson64: (x) => { const p = C.cdfSimpson(x, 64); return { p, q: 1 - p }; },
  taylor: (x) => { const p = C.cdfTaylor(x); return { p, q: 1 - p }; },
  series: (x) => { const p = C.cdfSeries(x); return { p, q: 1 - p }; },
  cf: (x) => { if (x === 0) return { p: NaN, q: NaN }; const t = C.tailCF(x); return x > 0 ? { p: 1 - t, q: t } : { p: t, q: 1 - t }; },
  AS: (x) => { const p = C.cdfAS(x); return { p, q: 1 - p }; },
  final: (x) => C.normalCdf(x),
};
console.log("     x | " + Object.keys(methods).map((k) => k.padStart(19)).join(" | "));
for (const xs of POINTS) {
  const x = Number(xs);
  const cells = Object.values(methods).map((m) => {
    const r = m(x);
    return (rel(r.p, ref[xs].p.value).toExponential(1) + "/" + rel(r.q, ref[xs].q.value).toExponential(1)).padStart(19);
  });
  console.log(xs.padStart(6), "|", cells.join(" | "));
}

console.log("\nterms needed");
for (const x of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
  const a = {}, b = {}, c = {};
  C.cdfTaylor(x, a); C.seriesSum(x, b); C.cfDenominator(x, c);
  console.log(String(x).padStart(4), "taylor", a.terms, "series", b.terms, "cf", c.terms);
}

// worst errors on a fine grid, against the reference with fewer digits
console.log("\nmax errors on x = -8..8 step 0.05 (absolute on Phi, relative on min(Phi, 1-Phi))");
const worst = {};
for (let i = -160; i <= 160; i++) {
  const xs = (i / 20).toFixed(2), x = Number(xs);
  const r = C.reference(xs);
  const P = Number(C.significant(r.p, 20).text), Q = Number(C.significant(r.q, 20).text);
  for (const [name, m] of Object.entries(methods)) {
    if (name === "cf" && x === 0) continue;
    const v = m(x);
    const small = x >= 0 ? rel(v.q, Q) : rel(v.p, P);
    const w = worst[name] || (worst[name] = { abs: 0, absAt: 0, rel: 0, relAt: 0 });
    const ab = Math.abs(v.p - P);
    if (ab > w.abs) { w.abs = ab; w.absAt = x; }
    if (small > w.rel) { w.rel = small; w.relAt = x; }
  }
}
for (const [k, w] of Object.entries(worst)) console.log(k.padStart(10), "abs", w.abs.toExponential(2), "at", w.absAt, " rel tail", w.rel.toExponential(2), "at", w.relAt);

console.log("\nSimpson convergence at x = 2 (abs error)");
const P2 = ref["2"].p.value;
for (const n of [2, 4, 8, 16, 32, 64, 128, 256]) {
  console.log(String(n).padStart(4), "simpson", Math.abs(C.cdfSimpson(2, n) - P2).toExponential(3), "trapezoid", Math.abs(C.cdfTrapezoid(2, n) - P2).toExponential(3));
}

console.log("\ntiming (ns per call, 1e6 random x in [-6, 6])");
const xsR = new Float64Array(1e6);
let seed = 12345;
for (let i = 0; i < xsR.length; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; xsR[i] = (seed / 2147483648) * 12 - 6; }
const timed = {
  simpson64: (x) => C.cdfSimpson(x, 64),
  taylor: C.cdfTaylor,
  series: C.cdfSeries,
  cf: (x) => C.tailCF(x),
  AS: C.cdfAS,
  final: (x) => C.normalCdf(x).p,
};
for (let pass = 0; pass < 2; pass++) {
  for (const [k, f] of Object.entries(timed)) {
    const t0 = process.hrtime.bigint();
    let s = 0;
    for (let i = 0; i < xsR.length; i++) s += f(xsR[i]);
    const ns = Number(process.hrtime.bigint() - t0) / xsR.length;
    if (pass) console.log(k.padStart(10), ns.toFixed(1), "ns", s > 0 ? "" : "!");
  }
}
const t0 = process.hrtime.bigint();
for (let i = 0; i < 20; i++) C.reference("1.234");
console.log("reference (BigInt)", (Number(process.hrtime.bigint() - t0) / 20 / 1e3).toFixed(0), "µs per call at x = 1.234");
