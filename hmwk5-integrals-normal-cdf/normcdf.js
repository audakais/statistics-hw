"use strict";

// Ex. 2: several ways to compute the standard normal CDF, and a high-precision reference.

(function (root) {

const INV_SQRT2PI = 0.3989422804014327; // 1 / sqrt(2 pi)

// density; x² is split as xh² + (x - xh)(x + xh) with xh a multiple of 1/16, so xh² is exact and
// the rounding error of x*x is not multiplied by x² inside exp() in the far tail
function pdf(x) {
  const ax = Math.abs(x);
  const xh = Math.round(ax * 16) / 16, xl = ax - xh;
  return INV_SQRT2PI * Math.exp(-0.5 * xh * xh) * Math.exp(-0.5 * xl * (ax + xh));
}

// ---------------------------------------------------------------- 1. numerical integration

// Phi(x) = 1/2 + integral of phi on [0, x], composite Simpson with n (even) subintervals
function cdfSimpson(x, n = 64) {
  const ax = Math.abs(x), h = ax / n;
  let s = pdf(0) + pdf(ax);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * pdf(i * h);
  const area = (s * h) / 3;
  return x >= 0 ? 0.5 + area : 0.5 - area;
}

function cdfTrapezoid(x, n = 64) {
  const ax = Math.abs(x), h = ax / n;
  let s = 0.5 * (pdf(0) + pdf(ax));
  for (let i = 1; i < n; i++) s += pdf(i * h);
  const area = s * h;
  return x >= 0 ? 0.5 + area : 0.5 - area;
}

// ---------------------------------------------------------------- 2. series

// term-by-term integral of the Taylor series of exp(-t²/2) (alternating):
// Phi(x) = 1/2 + (1/sqrt(2 pi)) sum_k (-1)^k x^(2k+1) / (2^k k! (2k+1))
function cdfTaylor(x, stats) {
  const h = 0.5 * x * x;
  let term = x, sum = x, k = 1;
  for (; k < 1000; k++) {
    term *= -h / k;
    const add = term / (2 * k + 1);
    sum += add;
    if (Math.abs(add) <= 1e-17 * Math.abs(sum)) break;
  }
  if (stats) stats.terms = k;
  return 0.5 + INV_SQRT2PI * sum;
}

// same function written as phi(x) times a series of positive terms:
// Phi(x) = 1/2 + phi(x) (x + x³/3 + x⁵/(3·5) + x⁷/(3·5·7) + ...)
function seriesSum(ax, stats) {
  const x2 = ax * ax;
  let term = ax, sum = ax, k = 1;
  for (; k < 1000; k++) {
    term *= x2 / (2 * k + 1);
    sum += term;
    if (term <= 1e-17 * sum) break;
  }
  if (stats) stats.terms = k;
  return sum;
}

function cdfSeries(x, stats) {
  const s = seriesSum(Math.abs(x), stats) * pdf(x);
  return x >= 0 ? 0.5 + s : 0.5 - s;
}

// ---------------------------------------------------------------- 3. continued fraction for the tail

// Laplace: Q(x) = 1 - Phi(x) = phi(x) / (x + 1/(x + 2/(x + 3/(x + ...)))), x > 0,
// evaluated forward with the modified Lentz method until the factor is 1 to machine precision
function cfDenominator(ax, stats) {
  let f = ax, C = ax, D = 0, j = 1;
  for (; j < 5000; j++) {
    D = 1 / (ax + j * D);
    C = ax + j / C;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  if (stats) stats.terms = j;
  return f;
}

function tailCF(x, stats) {
  return pdf(x) / cfDenominator(Math.abs(x), stats);
}

// ---------------------------------------------------------------- 4. classic polynomial approximation

// Abramowitz & Stegun 26.2.17, absolute error below 7.5e-8
function cdfAS(x) {
  const ax = Math.abs(x), t = 1 / (1 + 0.2316419 * ax);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const q = pdf(ax) * poly;
  return x >= 0 ? 1 - q : q;
}

// ---------------------------------------------------------------- 5. final method

// series where it converges fast, continued fraction in the tails.
// Returns both Phi(x) and 1 - Phi(x), each computed without subtracting from 1 when it is small.
const SWITCH = 2;
function normalCdf(x, sw = SWITCH) {
  const ax = Math.abs(x);
  let upper; // P(Z > |x|)
  if (ax < sw) upper = 0.5 - pdf(ax) * seriesSum(ax);
  else upper = pdf(ax) / cfDenominator(ax);
  return x >= 0 ? { p: 1 - upper, q: upper } : { p: upper, q: 1 - upper };
}

// ---------------------------------------------------------------- high-precision reference (BigInt)

// Fixed point with D decimal digits. x is given as a decimal string, so it is exact.
// Phi(x) = 1/2 + phi(x) * sum_k x^(2k+1) / (1·3·...·(2k+1)), every quantity carried to D digits.
// phi(x) and the tail are both about 10^(-0.434 x²/2) small, hence the extra digits for large |x|.
function reference(xStr, D) {
  const xd = Math.abs(parseFloat(xStr));
  D = D || 80 + Math.ceil(0.4343 * xd * xd);
  const S = 10n ** BigInt(D);
  const neg = xStr.trim().startsWith("-");
  const [ip, fp = ""] = xStr.trim().replace(/^[-+]/, "").split(".");
  const xNum = BigInt(ip + fp), xDen = 10n ** BigInt(fp.length);   // |x| = xNum / xDen
  const fx = (xNum * S) / xDen;                                     // |x| in fixed point
  const mul = (a, b) => (a * b) / S;

  // pi by Machin: pi = 16 atan(1/5) - 4 atan(1/239)
  const atanInv = (n) => {
    const N = BigInt(n), N2 = N * N;
    let p = S / N, sum = p, k = 1n, sign = -1n;
    while (p !== 0n) { p /= N2; const t = p / (2n * k + 1n); sum += sign * t; sign = -sign; k++; }
    return sum;
  };
  const pi = 16n * atanInv(5) - 4n * atanInv(239);
  const isqrt = (v) => {                                            // floor(sqrt(v)), Newton from above
    let r = 1n << BigInt((v.toString(2).length >> 1) + 1);
    for (;;) { const nr = (r + v / r) >> 1n; if (nr >= r) return r; r = nr; }
  };
  const sqrtFix = (a) => isqrt(a * S);
  const sqrt2pi = sqrtFix(2n * pi);

  // e^v for v = x²/2 >= 0, Taylor series with positive terms
  const v = (xNum * xNum * S) / (2n * xDen * xDen);
  let term = S, ev = S, k = 1n;
  while (term !== 0n) { term = (term * v) / (S * k); ev += term; k++; }
  const phi = (S * S) / mul(sqrt2pi, ev);                           // 1/(sqrt(2 pi) e^v)

  // sum of x^(2k+1)/(2k+1)!!
  const x2 = mul(fx, fx);
  let t = fx, sum = fx;
  for (let j = 1n; t !== 0n; j++) { t = (t * x2) / (S * (2n * j + 1n)); sum += t; }
  const half = S / 2n, s = mul(phi, sum);
  const upper = half - s, lower = half + s;                         // P(Z > |x|), P(Z < |x|)
  const toStr = (a) => fixedToString(a, D);
  return neg ? { p: toStr(upper), q: toStr(lower) } : { p: toStr(lower), q: toStr(upper) };
}

function fixedToString(a, D) {
  const s = a.toString().padStart(D + 1, "0");
  return s.slice(0, s.length - D) + "." + s.slice(s.length - D);
}

// first `sig` significant digits of a decimal string, as a string and as a Number
function significant(str, sig = 20) {
  const [ip, fp] = str.split(".");
  const digits = (ip + fp).replace(/^0+/, "");
  const lead = (ip + fp).length - digits.length;     // zeros before the first significant digit
  const exp = ip.length - lead - 1;
  const mant = digits.slice(0, 1) + "." + digits.slice(1, sig);
  return { text: `${mant}e${exp}`, value: Number(`${mant}e${exp}`) };
}

const api = {
  pdf, cdfSimpson, cdfTrapezoid, cdfTaylor, cdfSeries, seriesSum, tailCF, cfDenominator, cdfAS,
  normalCdf, SWITCH, reference, significant,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.NormCdf = api;

})(typeof window !== "undefined" ? window : globalThis);
