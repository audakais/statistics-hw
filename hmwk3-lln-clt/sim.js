"use strict";

// Penetration-score simulation for HMWK3.
// m attackers, each one goes through n systems in order. X[j][i] is the score
// attacker j gets on system i; every X is i.i.d.
//   Bernoulli model:  X in {0, 1},  P(X = 1) = p
//   Rademacher model: X in {-1, +1}, P(X = +1) = P(X = -1) = 1/2
// For every attacker we keep S_k = X_1 + ... + X_k at a list of checkpoints k,
// and the whole path for the first few attackers (for the trajectory plot).

(function (root) {

// mulberry32: small seeded PRNG, so every run of the page gives the same numbers
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

function moments(model, p) {
  return model === "bernoulli"
    ? { mu: p, sigma2: p * (1 - p) }
    : { mu: 0, sigma2: 1 };
}

// checkpoints: increasing list of n values; paths: how many attackers to keep in full
function simulate({ model, p = 0.5, m, checkpoints, seed, paths = 0, pathPoints = 400 }) {
  const rand = rng(seed);
  const nMax = checkpoints[checkpoints.length - 1];
  const S = checkpoints.map(() => new Float64Array(m)); // S[c][j] = S_{checkpoints[c]} of attacker j
  const stride = Math.max(1, Math.floor(nMax / pathPoints));
  const pathK = [];
  for (let k = stride; k <= nMax; k += stride) pathK.push(k);
  const pathS = [];
  // which systems were penetrated by at least one attacker (Bernoulli only)
  const hitBy = model === "bernoulli" ? new Uint16Array(nMax) : null;

  for (let j = 0; j < m; j++) {
    let s = 0, c = 0;
    const keep = j < paths ? new Float64Array(pathK.length) : null;
    let pk = 0;
    for (let i = 1; i <= nMax; i++) {
      const u = rand();
      let x;
      if (model === "bernoulli") {
        x = u < p ? 1 : 0;
        if (x && hitBy[i - 1] < 65535) hitBy[i - 1]++;
      } else {
        x = u < 0.5 ? 1 : -1;
      }
      s += x;
      if (i === checkpoints[c]) { S[c][j] = s; c++; }
      if (keep && i === pathK[pk]) { keep[pk] = s; pk++; }
    }
    if (keep) pathS.push(keep);
  }
  return { model, p, m, checkpoints, S, pathK, pathS, hitBy };
}

// ---------------------------------------------------------------- statistics

function mean(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

// unbiased sample variance
function variance(a) {
  const mu = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - mu) ** 2;
  return s / (a.length - 1);
}

function scaled(a, factor) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * factor;
  return out;
}

// erf with Abramowitz & Stegun 7.1.26 (absolute error below 1.5e-7)
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function normalPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Kolmogorov-Smirnov distance sup |F_emp(z) - Phi(z)|
function ksNormal(sample) {
  const z = Float64Array.from(sample).sort();
  const m = z.length;
  let d = 0;
  for (let i = 0; i < m; i++) {
    // at a tie, compare only after the last copy of the value (right-continuous ECDF)
    if (i + 1 < m && z[i + 1] === z[i]) continue;
    const F = normalCdf(z[i]);
    let first = i;
    while (first > 0 && z[first - 1] === z[i]) first--;
    d = Math.max(d, Math.abs((i + 1) / m - F), Math.abs(first / m - F));
  }
  return d;
}

// |S/n - mu| > eps, written as |S - n mu| > n eps. S is an integer and n*eps often
// lands exactly on a lattice point (n = 100, eps = 0.05), so the comparison gets a
// small tolerance instead of trusting floating point at the boundary.
function farFromMean(s, n, mu, eps) {
  return Math.abs(s - n * mu) > n * eps + 1e-9 * n;
}

// share of attackers whose average S_n/n is more than eps away from mu
function tailFraction(S, n, mu, eps) {
  let c = 0;
  for (let i = 0; i < S.length; i++) if (farFromMean(S[i], n, mu, eps)) c++;
  return c / S.length;
}

// exact P(|S_n/n - mu| > eps) from the binomial distribution.
// Bernoulli: S = B with B ~ Bin(n, p). Rademacher: S = 2B - n with B ~ Bin(n, 1/2).
// The pmf is built in log space because (1-p)^n underflows for n in the thousands.
function exactTail(model, p, n, eps) {
  const q = model === "bernoulli" ? p : 0.5;
  const mu = model === "bernoulli" ? p : 0;
  const lp = Math.log(q), lq = Math.log(1 - q);
  let logC = 0; // log binom(n, k)
  let tail = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) logC += Math.log((n - k + 1) / k);
    const s = model === "bernoulli" ? k : 2 * k - n;
    if (farFromMean(s, n, mu, eps)) tail += Math.exp(logC + k * lp + (n - k) * lq);
  }
  return Math.min(1, tail);
}

// least-squares slope of log(y) against log(x)
function logLogSlope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log);
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  let num = 0, den = 0;
  for (let i = 0; i < lx.length; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  return num / den;
}

function histogram(a, lo, hi, bins) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (let i = 0; i < a.length; i++) {
    const b = Math.floor((a[i] - lo) / w);
    if (b >= 0 && b < bins) counts[b]++;
  }
  return { counts, lo, hi, w };
}

function maxOf(a, count = a.length) {
  let mx = -Infinity;
  for (let i = 0; i < count; i++) if (a[i] > mx) mx = a[i];
  return mx;
}

const api = {
  rng, moments, simulate, mean, variance, scaled,
  erf, normalCdf, normalPdf, ksNormal, farFromMean, tailFraction, exactTail, logLogSlope,
  histogram, maxOf,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Sim = api;

})(typeof window !== "undefined" ? window : globalThis);
