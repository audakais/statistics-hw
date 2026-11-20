// node tools/check.js  ->  prints the numbers quoted in the report
const P = require("../prob.js");

// ---- counterexamples
for (const kind of ["bern", "jump"]) {
  const paths = P.counterexample(kind, 2000, 10000, 11);
  const row = [];
  for (const n of [10, 100, 1000]) {
    const now = paths.filter((h) => h.includes(n)).length / paths.length;
    const later = paths.filter((h) => h.some((m) => m >= n)).length / paths.length;
    row.push(`n=${n} P(X_n!=0)=${now.toFixed(4)} P(some m in [n,1e4])=${later.toFixed(4)}`);
  }
  console.log(kind, row.join(" | "));
}

// ---- LLN / CLT
const cps = [1, 2, 5, 10, 30, 100, 300, 1000, 5000];
for (const key of Object.keys(P.LAWS)) {
  const t0 = Date.now();
  const law = P.LAWS[key];
  const eps = 0.1;
  const r = P.runningMeans(key, 2000, 5000, cps, eps, 21);
  const out = [];
  cps.forEach((n, c) => {
    const a = r.at[c];
    const pr = a.filter((v) => Math.abs(v - r.centre) > eps).length / a.length;
    const sup = Array.from(r.last).filter((l) => l >= n).length / a.length;
    const msq = a.reduce((s, v) => s + (v - r.centre) ** 2, 0) / a.length;
    const z = Number.isFinite(law.sigma) ? Array.from(a, (v) => (Math.sqrt(n) * (v - law.mu)) / law.sigma) : null;
    out.push(`n=${n} P=${pr.toFixed(3)} sup=${sup.toFixed(3)} cheb=${Number.isFinite(law.sigma) ? Math.min(1, law.sigma ** 2 / (n * eps * eps)).toFixed(3) : "-"} msq=${msq.toPrecision(3)} th=${(law.sigma ** 2 / n).toPrecision(3)} KS=${z ? P.ksNormal(z).toFixed(3) : "-"}`);
  });
  console.log("\n" + law.label, Date.now() - t0, "ms\n " + out.join("\n "));
  if (Number.isFinite(law.sigma)) {
    const i1 = cps.indexOf(1000), i2 = cps.indexOf(5000);
    // Z_n and Z_m on the same paths
    const za = Array.from(r.at[i1], (v) => (Math.sqrt(1000) * (v - law.mu)) / law.sigma);
    const zb = Array.from(r.at[i2], (v) => (Math.sqrt(5000) * (v - law.mu)) / law.sigma);
    const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
    const ma = mean(za), mb = mean(zb);
    let cab = 0, va = 0, vb = 0, vd = 0;
    for (let i = 0; i < za.length; i++) { cab += (za[i] - ma) * (zb[i] - mb); va += (za[i] - ma) ** 2; vb += (zb[i] - mb) ** 2; vd += (zb[i] - za[i]) ** 2; }
    console.log(" corr(Z1000,Z5000)=", (cab / Math.sqrt(va * vb)).toFixed(3), "theory", Math.sqrt(1000 / 5000).toFixed(3),
      " E(Z5000-Z1000)^2=", (vd / za.length).toFixed(3), "theory", (2 - 2 * Math.sqrt(0.2)).toFixed(3));
  }
}

// ---- sqrt(n)
const ns = []; for (let k = 0; k <= 12; k++) ns.push(2 ** k);
const t0 = Date.now();
const v = P.spreadOfMean(2000, ns, 31);
console.log("\nspread sim ms", Date.now() - t0);
for (const kind of ["iid", "ar", "equi", "cauchy"]) {
  const sp = v[kind].map((a) => P.robustSpread(a));
  const big = ns.map((n, i) => [n, sp[i]]).filter(([n]) => n >= 64);
  console.log(kind, "slope(64..4096)", P.logSlope(big.map((x) => x[0]), big.map((x) => x[1])).toFixed(3),
    ns.map((n, i) => `${n}:${sp[i].toFixed(4)}/${P.theorySpread(kind, n).toFixed(4)}`).join(" "));
}
console.log("AR n*Var limit (1+rho)/(1-rho) =", (1.8 / 0.2), "sqrt", Math.sqrt(9), " n=4096 n*Var", (4096 * P.theorySpread("ar", 4096) ** 2).toFixed(4));

// ---- Bayes: diagnostic test
const ppv = (prev, se, sp) => (se * prev) / (se * prev + (1 - sp) * (1 - prev));
const p1 = ppv(0.01, 0.99, 0.95);
console.log("\nPPV", p1, "second positive", ppv(p1, 0.99, 0.95));
console.log("Berkeley P(F|Adm)", (557 / 1835) * (1835 / 4526) / (1755 / 4526), 557 / 1755);

// ---- Beta-Binomial on dept B women 17/25
for (const [name, a, b] of [["uniform", 1, 1], ["jeffreys", 0.5, 0.5], ["sceptical", 20, 20], ["men B", 63, 37]]) {
  const rows = [];
  for (const scale of [1, 10, 100]) {
    const po = P.posterior(a, b, 17 * scale, 25 * scale);
    rows.push(`n=${25 * scale}: mean ${po.mean.toFixed(4)} CI [${po.lo.toFixed(4)}, ${po.hi.toFixed(4)}] w ${po.w.toFixed(3)} sd ${po.sd.toFixed(4)}`);
  }
  console.log(name, rows.join(" | "));
}
const wald = (k, n) => { const p = k / n, h = P.Z975 * Math.sqrt(p * (1 - p) / n); return [p - h, p + h]; };
console.log("MLE 17/25", 17 / 25, "Wald", wald(17, 25).map((x) => x.toFixed(4)));
console.log("men B", 353 / 560);

// ---- coverage
for (const n of [20, 100]) {
  for (const m of ["wald", "uniform", "jeffreys"]) {
    const ints = P.intervals(m, n);
    const grid = []; for (let i = 1; i < 500; i++) grid.push(i / 500);
    const cov = grid.map((p) => P.coverage(ints, n, p));
    const avg = cov.reduce((s, x) => s + x) / cov.length;
    console.log(`coverage n=${n} ${m}: at p=0.1 ${P.coverage(ints, n, 0.1).toFixed(4)} p=0.5 ${P.coverage(ints, n, 0.5).toFixed(4)} min(0.05..0.95) ${Math.min(...cov.filter((_, j) => grid[j] >= 0.05 && grid[j] <= 0.95)).toFixed(4)} avg ${avg.toFixed(4)}`);
  }
}

// ---- numerical spot values compared in tools/check.py
for (const [x, a, b] of [[0.3, 2, 5], [0.7, 18, 9], [0.5, 0.5, 0.5], [0.05, 17.5, 8.5], [0.9, 120, 30], [0.62, 37, 28]])
  console.log("betaCdf", x, a, b, P.betaCdf(x, a, b).toPrecision(15));
for (const x of [0.5, 1, 1.5, 3.7, 10.25, 50.5]) console.log("lnGamma", x, P.lnGamma(x).toPrecision(15));
