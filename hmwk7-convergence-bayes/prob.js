"use strict";

// Simulations for the modes of convergence, and the Beta-Binomial machinery for the Bayesian part.

(function (root) {

// ---------------------------------------------------------------- random numbers

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

// Box-Muller, one value per call (the second one is kept for the next call)
function normalGen(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = rand();
    while (u === 0) u = rand();
    const r = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * rand();
    spare = r * Math.sin(t);
    return r * Math.cos(t);
  };
}

// every law by inversion of its CDF; mu and sigma are Infinity / NaN when they do not exist
const LAWS = {
  exp: { label: "Exponential(1)", mu: 1, sigma: 1, draw: (u) => -Math.log(1 - u) },
  unif: { label: "Uniform(0, 1)", mu: 0.5, sigma: Math.sqrt(1 / 12), draw: (u) => u },
  bern: { label: "Bernoulli(0.3)", mu: 0.3, sigma: Math.sqrt(0.21), draw: (u) => (u < 0.3 ? 1 : 0) },
  pareto: { label: "Pareto(α = 1.5)", mu: 3, sigma: Infinity, draw: (u) => Math.pow(1 - u, -1 / 1.5) },
  cauchy: { label: "Cauchy(0, 1)", mu: NaN, sigma: NaN, centre: 0, draw: (u) => Math.tan(Math.PI * (u - 0.5)) },
};

// ---------------------------------------------------------------- two counterexamples

// (a) independent X_n ~ Bernoulli(1/n): -> 0 in probability and in L², not almost surely
// (b) X_n = n · 1{U < 1/n} with one U per path: -> 0 almost surely, not in L² (E X_n² = n)
// For each path, record the indices n <= N where X_n != 0.
function counterexample(kind, paths, N, seed) {
  const rand = rng(seed), out = [];
  for (let p = 0; p < paths; p++) {
    const hits = [];
    if (kind === "bern") {
      for (let n = 1; n <= N; n++) if (rand() < 1 / n) hits.push(n);
    } else {
      const u = rand();
      for (let n = 1; n <= N && u < 1 / n; n++) hits.push(n);
    }
    out.push(hits);
  }
  return out;
}

// ---------------------------------------------------------------- LLN and CLT

// M paths of the running mean up to N. Keeps the mean at the checkpoints, the last index where
// |mean - mu| > eps (for the almost sure view), and a thinned copy of the first few paths for plotting.
function runningMeans(lawKey, M, N, checkpoints, eps, seed, keepPaths = 40) {
  const law = LAWS[lawKey], rand = rng(seed);
  const centre = Number.isFinite(law.mu) ? law.mu : law.centre;
  const plotIdx = [];
  for (let k = 0; k <= 160; k++) plotIdx.push(Math.max(1, Math.round(Math.pow(N, k / 160))));
  const plotSet = [...new Set(plotIdx)];
  const at = checkpoints.map(() => new Float64Array(M));
  const last = new Int32Array(M);
  const paths = [];
  for (let m = 0; m < M; m++) {
    let s = 0, c = 0, pi = 0;
    const path = m < keepPaths ? [] : null;
    for (let n = 1; n <= N; n++) {
      s += law.draw(rand());
      const mean = s / n;
      if (Math.abs(mean - centre) > eps) last[m] = n;
      if (c < checkpoints.length && n === checkpoints[c]) { at[c][m] = mean; c++; }
      if (path && pi < plotSet.length && n === plotSet[pi]) { path.push([n, mean]); pi++; }
    }
    if (path) paths.push(path);
  }
  return { law, centre, at, last, paths };
}

// ---------------------------------------------------------------- why sqrt(n)

// spread of the sample mean for four sequences with unit marginal scale:
// iid N(0,1); stationary AR(1) with rho = 0.8; equicorrelated normals with rho = 0.1; iid Cauchy.
function spreadOfMean(M, ns, seed) {
  const rand = rng(seed), gauss = normalGen(rand), N = ns[ns.length - 1];
  const kinds = ["iid", "ar", "equi", "cauchy"];
  const vals = {};
  for (const k of kinds) vals[k] = ns.map(() => new Float64Array(M));
  const rhoAR = 0.8, sAR = Math.sqrt(1 - rhoAR * rhoAR), rhoEq = 0.1;
  for (let m = 0; m < M; m++) {
    const w = gauss();
    let sI = 0, sA = 0, sE = 0, sC = 0, x = gauss(), c = 0;
    for (let n = 1; n <= N; n++) {
      sI += gauss();
      if (n > 1) x = rhoAR * x + sAR * gauss();
      sA += x;
      sE += Math.sqrt(rhoEq) * w + Math.sqrt(1 - rhoEq) * gauss();
      sC += Math.tan(Math.PI * (rand() - 0.5));
      if (n === ns[c]) {
        vals.iid[c][m] = sI / n; vals.ar[c][m] = sA / n; vals.equi[c][m] = sE / n; vals.cauchy[c][m] = sC / n;
        c++;
      }
    }
  }
  return vals;
}

// exact standard deviation of the mean for the three Gaussian sequences, and the Cauchy spread
function theorySpread(kind, n) {
  if (kind === "iid") return 1 / Math.sqrt(n);
  if (kind === "equi") return Math.sqrt(0.1 + 0.9 / n);
  if (kind === "cauchy") return 2 / 1.3489795003921634; // IQR of the standard Cauchy is 2
  let s = 1; // AR(1): Var(mean) = (1/n) [1 + 2 sum_{k=1}^{n-1} (1 - k/n) rho^k]
  for (let k = 1, r = 0.8; k < n; k++, r *= 0.8) s += 2 * (1 - k / n) * r;
  return Math.sqrt(s / n);
}

function quantile(sorted, q) {
  const h = (sorted.length - 1) * q, lo = Math.floor(h);
  return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo]);
}
// robust spread: IQR / 1.349, which equals the standard deviation for normal data
function robustSpread(arr) {
  const s = Float64Array.from(arr).sort();
  return (quantile(s, 0.75) - quantile(s, 0.25)) / 1.3489795003921634;
}

// least-squares slope of log y against log x
function logSlope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log), n = xs.length;
  const mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (lx[i] - mx) * (ly[i] - my); sxx += (lx[i] - mx) ** 2; }
  return sxy / sxx;
}

// ---------------------------------------------------------------- normal CDF (method of HW5)

const INV_SQRT2PI = 0.3989422804014327;
function pdf(x) {
  const ax = Math.abs(x);
  const xh = Math.round(ax * 16) / 16, xl = ax - xh;
  return INV_SQRT2PI * Math.exp(-0.5 * xh * xh) * Math.exp(-0.5 * xl * (ax + xh));
}
function normalCdf(x) {
  const z = Math.abs(x);
  let upper;
  if (z < 2) {
    let term = z, sum = z;
    for (let k = 1; k < 1000; k++) { term *= (z * z) / (2 * k + 1); sum += term; if (term <= 1e-17 * sum) break; }
    upper = 0.5 - pdf(z) * sum;
  } else {
    let f = z, C = z, D = 0;
    for (let j = 1; j < 5000; j++) {
      D = 1 / (z + j * D); C = z + j / C;
      const delta = C * D; f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    upper = pdf(z) / f;
  }
  return x >= 0 ? 1 - upper : upper;
}

// Kolmogorov distance between the sample and N(0, 1)
function ksNormal(arr) {
  const s = Float64Array.from(arr).sort(), n = s.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const F = normalCdf(s[i]);
    d = Math.max(d, (i + 1) / n - F, F - i / n);
  }
  return d;
}

// ---------------------------------------------------------------- Beta-Binomial

// log Gamma: shift the argument above 20, then the Stirling series (first omitted term < 2e-15)
function lnGamma(x) {
  let shift = 0;
  while (x < 20) { shift += Math.log(x); x += 1; }
  const z2 = 1 / (x * x);
  const series = (1 / 12 - z2 * (1 / 360 - z2 * (1 / 1260 - z2 / 1680))) / x;
  return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + series - shift;
}

function betaPdf(x, a, b) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lnGamma(a + b) - lnGamma(a) - lnGamma(b));
}

// continued fraction for the incomplete beta function (modified Lentz)
function betaCF(a, b, x) {
  const TINY = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

// regularized incomplete beta I_x(a, b) = P(Beta(a, b) <= x)
function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaCF(a, b, x)) / a;
  return 1 - (bt * betaCF(b, a, 1 - x)) / b;
}

// quantile by bisection (the CDF is increasing, 100 halvings reach machine precision)
function betaQuantile(q, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (betaCdf(mid, a, b) < q) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function posterior(a, b, k, n) {
  const A = a + k, B = b + n - k;
  return {
    A, B,
    mean: A / (A + B),
    mode: A > 1 && B > 1 ? (A - 1) / (A + B - 2) : NaN,
    sd: Math.sqrt((A * B) / ((A + B) ** 2 * (A + B + 1))),
    lo: betaQuantile(0.025, A, B),
    hi: betaQuantile(0.975, A, B),
    w: (a + b) / (a + b + n), // weight of the prior mean in the posterior mean
  };
}

// ---------------------------------------------------------------- exact frequentist coverage

const Z975 = 1.959963984540054;
function intervals(method, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    if (method === "wald") {
      const p = k / n, h = Z975 * Math.sqrt((p * (1 - p)) / n);
      out.push([p - h, p + h]);
    } else {
      const a = method === "jeffreys" ? 0.5 : 1;
      out.push([betaQuantile(0.025, k + a, n - k + a), betaQuantile(0.975, k + a, n - k + a)]);
    }
  }
  return out;
}

function binomPmf(k, n, p) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

// P_p(interval contains p) = sum over the outcomes k whose interval covers p
function coverage(ints, n, p) {
  let c = 0;
  for (let k = 0; k <= n; k++) if (ints[k][0] <= p && p <= ints[k][1]) c += binomPmf(k, n, p);
  return c;
}

const api = {
  rng, normalGen, LAWS, counterexample, runningMeans, spreadOfMean, theorySpread, quantile, robustSpread, logSlope,
  normalCdf, ksNormal, lnGamma, betaPdf, betaCdf, betaQuantile, posterior, Z975, intervals, binomPmf, coverage,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
else Object.assign(root, api);

})(this);
