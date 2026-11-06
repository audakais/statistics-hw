"use strict";

// Ex. 1: Riemann sums (partition of the domain) and Lebesgue sums (partition of the range).

(function (root) {

// Si(pi) = integral of sin(x)/x on [0, pi], from its power series (terms decrease fast, no cancellation problem)
function siPi() {
  const x = Math.PI;
  let term = x, sum = x;
  for (let n = 1; n < 40; n++) {
    term *= (-x * x) / ((2 * n) * (2 * n + 1));
    sum += term / (2 * n + 1);
  }
  return sum;
}

const INV_SQRT2PI = 0.3989422804014327;
const gauss = (x) => INV_SQRT2PI * Math.exp(-0.5 * x * x);
const sinc = (x) => (x === 0 ? 1 : Math.sin(x) / x);

// {x in [0, pi] : sin(x)/x >= y} = [0, r(y)], sinc is decreasing there; r(y) found by bisection
const BISECT_STEPS = 60;
function sincLevel(y) {
  if (y <= 0) return Math.PI;
  if (y >= 1) return 0;
  let lo = 0, hi = Math.PI;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = 0.5 * (lo + hi);
    if (sinc(mid) >= y) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Each function: domain [a, b], exact integral, range [lo, hi] and
// m(y) = measure of {x : f(x) >= y} for lo < y <= hi (the preimage that the Lebesgue sum needs).
// mCost = evaluations of f needed by one call of m (1 means a closed form).
const FUNCTIONS = [
  {
    key: "sin", label: "sin x on [0, π]", a: 0, b: Math.PI, exact: 2,
    f: Math.sin, lo: 0, hi: 1, m: (y) => Math.PI - 2 * Math.asin(Math.min(1, y)), mCost: 1,
    pre: "{sin x ≥ y} = [arcsin y, π − arcsin y]",
  },
  {
    key: "sq", label: "x² on [0, 1]", a: 0, b: 1, exact: 1 / 3,
    f: (x) => x * x, lo: 0, hi: 1, m: (y) => 1 - Math.sqrt(y), mCost: 1,
    pre: "{x² ≥ y} = [√y, 1]",
  },
  {
    key: "step13", label: "1 if x < 0.5, 3 if x ≥ 0.5", a: 0, b: 1, exact: 2,
    f: (x) => (x < 0.5 ? 1 : 3), lo: 1, hi: 3, m: (y) => (y <= 1 ? 1 : y <= 3 ? 0.5 : 0), mCost: 1,
    pre: "{f ≥ y} = [0.5, 1] for 1 < y ≤ 3",
  },
  {
    key: "abs", label: "|x − 0.5| on [0, 1]", a: 0, b: 1, exact: 0.25,
    f: (x) => Math.abs(x - 0.5), lo: 0, hi: 0.5, m: (y) => Math.max(0, 1 - 2 * y), mCost: 1,
    pre: "{|x − 0.5| ≥ y} = [0, 0.5 − y] ∪ [0.5 + y, 1]",
  },
  {
    key: "invsqrt", label: "1/√x on (0, 1]", a: 0, b: 1, exact: 2,
    f: (x) => 1 / Math.sqrt(x), lo: 1, hi: Infinity, m: (y) => (y <= 1 ? 1 : 1 / (y * y)), mCost: 1,
    geometric: true,
    pre: "{1/√x ≥ y} = (0, 1/y²]",
  },
  {
    key: "step10", label: "1 if x < 0.5, 0 if x ≥ 0.5", a: 0, b: 1, exact: 0.5,
    f: (x) => (x < 0.5 ? 1 : 0), lo: 0, hi: 1, m: (y) => (y <= 0 ? 1 : y <= 1 ? 0.5 : 0), mCost: 1,
    pre: "{f ≥ y} = [0, 0.5) for 0 < y ≤ 1",
  },
  {
    key: "sinc", label: "sin(x)/x on [0, π]", a: 0, b: Math.PI, exact: siPi(),
    f: sinc, lo: 0, hi: 1, m: sincLevel, mCost: BISECT_STEPS,
    pre: "{sin x / x ≥ y} = [0, r(y)], r(y) by bisection",
  },
  {
    key: "gauss", label: "φ(x) = e^(−x²/2)/√(2π) on [0, 3]", a: 0, b: 3, exact: 0.4986501019683699,
    f: gauss, lo: gauss(3), hi: INV_SQRT2PI,
    m: (y) => Math.min(3, Math.sqrt(Math.max(0, -2 * Math.log(y / INV_SQRT2PI)))), mCost: 1,
    pre: "{φ ≥ y} = [0, √(−2 ln(y√(2π)))]",
  },
];

// ---------------------------------------------------------------- Riemann

// tags at u = p/q of each subinterval of [0, 1], mapped to [a, b]; p, q are passed for the exact rational cases
function riemann(fn, N, rule) {
  const L = fn.b - fn.a, q = 2 * N;
  let s = 0;
  for (let k = 0; k < N; k++) {
    const p = rule === "mid" ? 2 * k + 1 : 2 * k + 2;
    s += fn.f(fn.a + (L * p) / q, p, q);
  }
  return (s * L) / N;
}

// ---------------------------------------------------------------- Lebesgue

// levels t_0 < t_1 < ... < t_N partitioning the range; geometric (up to N²) when f is unbounded
function levels(fn, N) {
  const t = new Float64Array(N + 1);
  if (fn.geometric) {
    const top = Math.log(N * N);
    for (let k = 0; k <= N; k++) t[k] = fn.lo * Math.exp((top * k) / N);
  } else {
    for (let k = 0; k <= N; k++) t[k] = fn.lo + ((fn.hi - fn.lo) * k) / N;
  }
  return t;
}

// lower sum: integral of the simple function equal to t_k on E_k = {t_k <= f < t_(k+1)},
//   sum_k t_k m(E_k) = t_0 (b - a) + sum_k (t_k - t_(k-1)) m(t_k)
// mid: same bands, measured at the middle level of each band
function lebesgue(fn, N, rule, t = levels(fn, N)) {
  let s = t[0] * (fn.b - fn.a);
  for (let k = 1; k <= N; k++) {
    const y = rule === "mid" ? 0.5 * (t[k - 1] + t[k]) : t[k];
    s += (t[k] - t[k - 1]) * fn.m(y);
  }
  return s;
}

// without a formula for the preimages: measure of each band estimated by counting M grid points
function lebesgueCounted(fn, N, M) {
  const t = levels(fn, N), L = fn.b - fn.a;
  const count = new Float64Array(N + 1);
  for (let j = 0; j < M; j++) {
    const v = fn.f(fn.a + (L * (2 * j + 1)) / (2 * M));
    let lo = 0, hi = N;                     // last k with t_k <= v
    if (v >= t[N]) lo = N;
    else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= v) lo = mid; else hi = mid; }
    count[lo]++;
  }
  let s = 0;
  for (let k = 0; k <= N; k++) {
    const level = k < N ? 0.5 * (t[k] + t[k + 1]) : t[N];
    s += (level * count[k] * L) / M;
  }
  return s;
}

// ---------------------------------------------------------------- pathological functions

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// Thomae at the rational tag p/q: 1 / (q / gcd(p, q))
function thomaeRiemann(N, rule) {
  const q = 2 * N;
  let s = 0;
  for (let k = 0; k < N; k++) {
    const p = rule === "mid" ? 2 * k + 1 : 2 * k + 2;
    s += gcd(p, q) / q;
  }
  return s / N;
}

// upper Darboux sum: on [k/N, (k+1)/N] the sup of Thomae is 1/q for the smallest q with a fraction p/q inside
function thomaeUpper(N) {
  let s = 0;
  for (let k = 0; k < N; k++) {
    for (let q = 1; q <= N; q++) {
      if (Math.floor((k * q + N - 1) / N) <= Math.floor(((k + 1) * q) / N)) { s += 1 / q; break; }
    }
  }
  return s / N;
}

// a double is a fraction m / 2^j, so "Thomae of a double" is 1 / 2^j
function thomaeFloat(x) {
  if (x === 0 || x === 1) return 1;
  let d = 1;
  while (x !== Math.floor(x)) { x *= 2; d *= 2; }
  return 1 / d;
}

const api = {
  FUNCTIONS, riemann, levels, lebesgue, lebesgueCounted, siPi,
  gcd, thomaeRiemann, thomaeUpper, thomaeFloat,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Integrals = api;

})(typeof window !== "undefined" ? window : globalThis);
