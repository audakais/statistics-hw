"use strict";

// Contingency tables, frequencies, expected counts under independence, chi-square test.

(function (root) {

// ---------------------------------------------------------------- data

// plain CSV: first line is the header, fields separated by commas, optional double quotes
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  const split = (l) => l.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
  const header = split(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const v = split(l), o = {};
    header.forEach((h, i) => (o[h] = v[i] === undefined ? "" : v[i]));
    return o;
  });
  return { header, rows };
}

// a table of counts (one line per combination, with a frequency column) becomes one record per unit
function expand(rows, freqKey, keep) {
  const out = [];
  for (const r of rows) {
    const f = Number(r[freqKey]);
    if (!Number.isInteger(f) || f < 0) throw new Error("bad frequency: " + r[freqKey]);
    const rec = {};
    for (const k of keep) rec[k] = r[k];
    for (let i = 0; i < f; i++) out.push(rec);
  }
  return out;
}

// mulberry32: small seeded PRNG, so the same run gives the same numbers
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ---------------------------------------------------------------- contingency table

const byLabel = (a, b) => a.localeCompare(b, "en", { numeric: true });

// one pass over the records: the categories are discovered, then every record adds 1 to its cell
function crosstab(records, xKey, yKey) {
  const rows = [...new Set(records.map((r) => r[xKey]))].sort(byLabel);
  const cols = [...new Set(records.map((r) => r[yKey]))].sort(byLabel);
  const ri = new Map(rows.map((v, i) => [v, i])), ci = new Map(cols.map((v, j) => [v, j]));
  const n = rows.map(() => cols.map(() => 0));
  for (const r of records) n[ri.get(r[xKey])][ci.get(r[yKey])]++;
  return withMargins({ xKey, yKey, rows, cols, n });
}

function withMargins(t) {
  t.r = t.n.map((row) => row.reduce((a, b) => a + b, 0));
  t.c = t.cols.map((_, j) => t.n.reduce((a, row) => a + row[j], 0));
  t.N = t.r.reduce((a, b) => a + b, 0);
  return t;
}

// everything derived from the counts
function analyse(t) {
  const { n, r, c, N } = t;
  const I = r.length, J = c.length;
  const joint = n.map((row) => row.map((v) => v / N));            // f_ij
  const fRow = r.map((v) => v / N), fCol = c.map((v) => v / N);   // f_i. and f_.j
  const rowProf = n.map((row, i) => row.map((v) => v / r[i]));    // f(y_j | x_i)
  const colProf = n.map((row) => row.map((v, j) => v / c[j]));    // f(x_i | y_j)
  const E = r.map((ri) => c.map((cj) => (ri * cj) / N));          // expected under independence

  let chi2 = 0, G2 = 0, minE = Infinity, small = 0;
  const contrib = [], resid = [], adj = [];
  for (let i = 0; i < I; i++) {
    contrib.push([]); resid.push([]); adj.push([]);
    for (let j = 0; j < J; j++) {
      const o = n[i][j], e = E[i][j], d = o - e;
      contrib[i].push((d * d) / e);
      resid[i].push(d / Math.sqrt(e));
      adj[i].push(d / Math.sqrt(e * (1 - r[i] / N) * (1 - c[j] / N)));
      chi2 += (d * d) / e;
      if (o > 0) G2 += 2 * o * Math.log(o / e);
      minE = Math.min(minE, e);
      if (e < 5) small++;
    }
  }
  const df = (I - 1) * (J - 1);
  const out = {
    joint, fRow, fCol, rowProf, colProf, E, contrib, resid, adj,
    chi2, G2, df, p: chi2Sf(chi2, df), pG2: chi2Sf(G2, df),
    V: Math.sqrt(chi2 / (N * Math.min(I - 1, J - 1))), minE, small,
  };
  if (I === 2 && J === 2) {
    // Yates continuity correction and the odds ratio, only defined for 2 x 2
    let y = 0;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const d = Math.max(0, Math.abs(n[i][j] - E[i][j]) - 0.5);
      y += (d * d) / E[i][j];
    }
    out.yates = y; out.pYates = chi2Sf(y, 1);
    out.oddsRatio = (n[0][0] * n[1][1]) / (n[0][1] * n[1][0]);
  }
  return out;
}

// ---------------------------------------------------------------- chi-square tail probability

// For an integer number of degrees of freedom k the survival function has a closed form
// (integration by parts of the chi-square density):
//   Q(x; 2) = e^(-x/2),   Q(x; 1) = 2 (1 - Phi(sqrt x)),
//   Q(x; k + 2) = Q(x; k) + (x/2)^(k/2) e^(-x/2) / Gamma(k/2 + 1).
// The added terms are built in logarithms so that nothing overflows for large x or k.
function chi2Sf(x, k) {
  if (!(x > 0)) return 1;
  const h = x / 2, lh = Math.log(h);
  let q, a, lgam;
  if (k % 2 === 0) { q = 0; a = 0; lgam = 0; }           // start from the empty sum, Gamma(1) = 1
  else { q = 2 * upperNormal(Math.sqrt(x)); a = 0.5; lgam = Math.log(Math.sqrt(Math.PI)); } // Gamma(1/2)
  // add (x/2)^a e^(-x/2) / Gamma(a + 1) for a = start, start + 1, ..., k/2 - 1
  for (; a < k / 2; a++) {
    lgam += Math.log(a === 0 ? 1 : a); // now lgam = log Gamma(a + 1)
    q += Math.exp(a * lh - h - lgam);
  }
  return Math.min(1, q);
}

// P(Z > z) for z >= 0, the method chosen in HW5: series below 2, Laplace continued fraction above
const INV_SQRT2PI = 0.3989422804014327;
function pdf(x) {
  const ax = Math.abs(x);
  const xh = Math.round(ax * 16) / 16, xl = ax - xh;
  return INV_SQRT2PI * Math.exp(-0.5 * xh * xh) * Math.exp(-0.5 * xl * (ax + xh));
}
function upperNormal(z) {
  if (z < 2) {
    const x2 = z * z;
    let term = z, sum = z;
    for (let k = 1; k < 1000; k++) {
      term *= x2 / (2 * k + 1);
      sum += term;
      if (term <= 1e-17 * sum) break;
    }
    return 0.5 - pdf(z) * sum;
  }
  let f = z, C = z, D = 0;
  for (let j = 1; j < 5000; j++) {
    D = 1 / (z + j * D);
    C = z + j / C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return pdf(z) / f;
}

// ---------------------------------------------------------------- permutation test

// Under H0 the y labels are exchangeable given x. Shuffling them keeps both margins fixed,
// so every shuffled table has the same expected counts and only the cells change.
function permutationTest(records, xKey, yKey, B, seed) {
  const t = crosstab(records, xKey, yKey);
  const ri = new Map(t.rows.map((v, i) => [v, i])), ci = new Map(t.cols.map((v, j) => [v, j]));
  const xs = Int32Array.from(records, (r) => ri.get(r[xKey]));
  const ys = Int32Array.from(records, (r) => ci.get(r[yKey]));
  const I = t.rows.length, J = t.cols.length, N = t.N;
  const E = t.r.map((a) => t.c.map((b) => (a * b) / N));
  const stat = (cells) => {
    let s = 0;
    for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) {
      const d = cells[i * J + j] - E[i][j];
      s += (d * d) / E[i][j];
    }
    return s;
  };
  const obs = analyse(t).chi2;
  const rand = rng(seed), cells = new Int32Array(I * J), sims = new Float64Array(B);
  let hits = 0;
  for (let b = 0; b < B; b++) {
    shuffle(ys, rand);
    cells.fill(0);
    for (let k = 0; k < N; k++) cells[xs[k] * J + ys[k]]++;
    sims[b] = stat(cells);
    if (sims[b] >= obs - 1e-9) hits++;
  }
  return { obs, B, hits, p: (hits + 1) / (B + 1), sims };
}

// split the records by a third variable and build one table per stratum
function stratify(records, zKey, xKey, yKey) {
  const levels = [...new Set(records.map((r) => r[zKey]))].sort(byLabel);
  return levels.map((z) => ({ z, t: crosstab(records.filter((r) => r[zKey] === z), xKey, yKey) }));
}

const api = { parseCSV, expand, rng, shuffle, crosstab, withMargins, analyse, chi2Sf, upperNormal, permutationTest, stratify };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else Object.assign(root, api);

})(this);
