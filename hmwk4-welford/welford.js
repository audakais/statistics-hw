"use strict";

// Running mean and variance (Knuth / Welford) plus the hacker experiment of Ex. 2.

(function (root) {

// ---------------------------------------------------------------- Ex. 1

function newStats() {
  return { k: 0, M: 0, SS: 0 };
}

function push(st, x) {
  const d = x - st.M;      // x_k - M_(k-1)
  st.M += d / ++st.k;      // M_k = M_(k-1) + (x_k - M_(k-1)) / k
  st.SS += d * (x - st.M); // SS_k = SS_(k-1) + (x_k - M_(k-1)) (x_k - M_k)
}

function sampleVariance(st) {
  return st.k > 1 ? st.SS / (st.k - 1) : NaN;
}

// textbook one-pass formula: SS = sum(x^2) - (sum x)^2 / n
function naiveSS(xs) {
  let s = 0, q = 0;
  for (const x of xs) { s += x; q += x * x; }
  return q - (s * s) / xs.length;
}

// two-pass formula: mean first, then the squared deviations
function batchSS(xs) {
  let s = 0;
  for (const x of xs) s += x;
  const mean = s / xs.length;
  let ss = 0;
  for (const x of xs) ss += (x - mean) ** 2;
  return ss;
}

// exact SS of integer data: (n sum(x^2) - (sum x)^2) / n, in BigInt
function exactSS(xs) {
  let s = 0n, q = 0n;
  for (const x of xs) { const b = BigInt(x); s += b; q += b * b; }
  const n = BigInt(xs.length);
  const num = n * q - s * s;
  return Number(num / n) + Number(num % n) / xs.length;
}

// ---------------------------------------------------------------- distributions on {0, ..., 10}

function binomialPmf(n, q) {
  const out = [];
  let c = 1;
  for (let k = 0; k <= n; k++) {
    out.push(c * q ** k * (1 - q) ** (n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return out;
}

const DISTRIBUTIONS = {
  skewed: {
    label: "skewed (default)",
    pmf: [0.30, 0.20, 0.14, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.01],
  },
  uniform: { label: "uniform on 0..10", pmf: new Array(11).fill(1 / 11) },
  binomial: { label: "Binomial(10, 0.3)", pmf: binomialPmf(10, 0.3) },
};

// exact moments of a pmf on {0, ..., 10}
function moments(pmf) {
  const mu = pmf.reduce((a, p, x) => a + p * x, 0);
  const central = (r) => pmf.reduce((a, p, x) => a + p * (x - mu) ** r, 0);
  const sigma2 = central(2), mu3 = central(3), mu4 = central(4);
  return { mu, sigma2, mu3, mu4, kurtosis: mu4 / (sigma2 * sigma2), skewness: mu3 / sigma2 ** 1.5 };
}

// exact sampling variances for a sample of size n
function theory(mom, n) {
  return {
    varMean: mom.sigma2 / n,
    varS2: (mom.mu4 - (mom.sigma2 ** 2 * (n - 3)) / (n - 1)) / n,
    covMeanS2: mom.mu3 / n,
    biasedMean: (mom.sigma2 * (n - 1)) / n,
  };
}

// ---------------------------------------------------------------- simulation

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

function cdfOf(pmf) {
  let c = 0;
  const out = pmf.map((p) => (c += p));
  out[out.length - 1] = 1;
  return out;
}

function draw(cdf, rand) {
  const u = rand();
  let x = 0;
  while (u >= cdf[x]) x++;
  return x;
}

function meanOf(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

// unbiased variance across a list of values, computed with the same recurrence
function varianceOf(a) {
  const st = newStats();
  for (let i = 0; i < a.length; i++) push(st, a[i]);
  return sampleVariance(st);
}

function covarianceOf(a, b) {
  const ma = meanOf(a), mb = meanOf(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

// m hackers, n systems each: one sampling mean and one sampling variance per hacker
function experiment(pmf, m, n, seed, tCrit) {
  const rand = rng(seed);
  const cdf = cdfOf(pmf);
  const mom = moments(pmf);
  const means = new Float64Array(m), vars = new Float64Array(m), sds = new Float64Array(m);
  let covered = 0;
  for (let j = 0; j < m; j++) {
    const st = newStats();
    for (let i = 0; i < n; i++) push(st, draw(cdf, rand));
    const s2 = sampleVariance(st);
    means[j] = st.M;
    vars[j] = s2;
    sds[j] = Math.sqrt(s2);
    if (Math.abs(st.M - mom.mu) <= tCrit * Math.sqrt(s2 / n)) covered++;
  }
  const th = theory(mom, n);
  const avgMean = meanOf(means), avgVar = meanOf(vars);
  return {
    n, m, means, vars,
    avgMean, avgVar,
    avgSd: meanOf(sds),
    avgBiased: (avgVar * (n - 1)) / n,
    varMean: varianceOf(means),
    varS2: varianceOf(vars),
    cov: covarianceOf(means, vars),
    zMean: (avgMean - mom.mu) / Math.sqrt(th.varMean / m),
    zVar: (avgVar - mom.sigma2) / Math.sqrt(th.varS2 / m),
    coverage: covered / m,
    th,
  };
}

// a few hackers kept step by step, for the running plot
function trajectories(pmf, count, nMax, seed) {
  const rand = rng(seed);
  const cdf = cdfOf(pmf);
  const out = [];
  for (let j = 0; j < count; j++) {
    const st = newStats();
    const M = new Float64Array(nMax), S2 = new Float64Array(nMax);
    for (let i = 0; i < nMax; i++) {
      push(st, draw(cdf, rand));
      M[i] = st.M;
      S2[i] = sampleVariance(st);
    }
    out.push({ M, S2 });
  }
  return out;
}

function logLogSlope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log);
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  let num = 0, den = 0;
  for (let i = 0; i < lx.length; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  return num / den;
}

const api = {
  newStats, push, sampleVariance, naiveSS, batchSS, exactSS,
  DISTRIBUTIONS, moments, theory, rng, cdfOf, draw, experiment, trajectories, logLogSlope,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Welford = api;

})(typeof window !== "undefined" ? window : globalThis);
