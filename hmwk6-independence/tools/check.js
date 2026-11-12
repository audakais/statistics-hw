// node tools/check.js  ->  prints every number quoted in the report
const fs = require("fs");
const path = require("path");
const S = require("../independence.js");

const { rows } = S.parseCSV(fs.readFileSync(path.join(__dirname, "..", "ucb-admissions.csv"), "utf8"));
const rec = S.shuffle(S.expand(rows, "Freq", ["Gender", "Admit", "Dept"]), S.rng(1973));
console.log("records", rec.length);

function show(t, label) {
  const a = S.analyse(t);
  console.log("\n==", label, "rows", t.rows.join("/"), "cols", t.cols.join("/"));
  console.log("n", JSON.stringify(t.n), "r", t.r, "c", t.c, "N", t.N);
  console.log("rowProf", a.rowProf.map((r) => r.map((v) => v.toFixed(4)).join(" ")).join(" | "));
  console.log("colProf", a.colProf.map((r) => r.map((v) => v.toFixed(4)).join(" ")).join(" | "));
  console.log("E", a.E.map((r) => r.map((v) => v.toFixed(3)).join(" ")).join(" | "));
  console.log("adj", a.adj.map((r) => r.map((v) => v.toFixed(2)).join(" ")).join(" | "));
  console.log("chi2", a.chi2.toFixed(10), "df", a.df, "p", a.p.toPrecision(15), "G2", a.G2.toFixed(4), "pG2", a.pG2.toExponential(3),
    "V", a.V.toFixed(4), "minE", a.minE.toFixed(2), a.yates !== undefined ? "yates " + a.yates.toFixed(4) + " p " + a.pYates.toExponential(4) + " OR " + a.oddsRatio.toFixed(4) : "");
  return a;
}

show(S.crosstab(rec, "Gender", "Admit"), "Gender x Admit");
show(S.crosstab(rec, "Dept", "Admit"), "Dept x Admit");
show(S.crosstab(rec, "Gender", "Dept"), "Gender x Dept");
let sum = 0;
for (const { z, t } of S.stratify(rec, "Dept", "Gender", "Admit")) {
  const a = show(t, "Dept " + z);
  sum += a.chi2;
}
console.log("\nsum of stratum chi2", sum.toFixed(4), "df 6 p", S.chi2Sf(sum, 6).toPrecision(15));
let sumB = 0;
for (const { z, t } of S.stratify(rec, "Dept", "Gender", "Admit")) if (z !== "A") sumB += S.analyse(t).chi2;
console.log("without A", sumB.toFixed(4), "df 5 p", S.chi2Sf(sumB, 5).toFixed(4));

// permutation tests
const t0 = Date.now();
const pm = S.permutationTest(rec, "Gender", "Admit", 2000, 7);
console.log("\nperm Gender x Admit hits", pm.hits, "p", pm.p, "max sim", Math.max(...pm.sims).toFixed(3), "ms", Date.now() - t0);
for (const { z } of S.stratify(rec, "Dept", "Gender", "Admit")) {
  const sub = rec.filter((r) => r.Dept === z);
  const q = S.permutationTest(sub, "Gender", "Admit", 2000, 7);
  console.log("perm dept", z, "hits", q.hits, "p", q.p.toFixed(4), "asym", S.analyse(S.crosstab(sub, "Gender", "Admit")).p.toFixed(4));
}

// chi2Sf spot values, compared in tools/check.py
for (const [x, k] of [[3.841458820694124, 1], [5.991464547107979, 2], [11.0705, 5], [92.2, 1], [21.7, 6], [1.0, 3], [50, 7], [800, 25], [2.5, 4]])
  console.log("sf", x, k, S.chi2Sf(x, k).toPrecision(15));
