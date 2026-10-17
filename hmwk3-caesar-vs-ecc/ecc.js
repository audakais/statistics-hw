"use strict";

// Toy public-key scheme on the real secp256k1 curve (y^2 = x^3 + 7 mod p).
// Same pointAdd / double-and-add as HMWK1, but with BigInt and the real 256-bit
// parameters. The only "toy" part is that the private key k is drawn from a
// small range [1, 2^KEY_BITS] instead of [1, n-1].
//
// Encryption is EC-ElGamal, one byte at a time:
//   message byte b  ->  point M = (b + 1) G        (+1 so that b = 0 is not O)
//   pick fresh random r in [1, n-1]
//   C1 = r G,  C2 = M + r Q
// Decryption with k: M = C2 - k C1, then b = index of M in a 256-entry table.

(function (root) {

const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const A = 0n;
const B = 7n;
const G = [
  0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
];

function mod(a, m = P) {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function modInverse(a, m = P) {
  a = mod(a, m);
  let oldR = a, r = m;
  let oldS = 1n, s = 0n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod(oldS, m);
}

// null = point at infinity O
function pointAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  if (x1 === x2 && mod(y1 + y2) === 0n) return null;

  let m;
  if (x1 === x2) {
    m = mod((3n * x1 * x1 + A) * modInverse(2n * y1));
  } else {
    m = mod((y2 - y1) * modInverse(x2 - x1));
  }
  const x3 = mod(m * m - x1 - x2);
  const y3 = mod(m * (x1 - x3) - y1);
  return [x3, y3];
}

function pointNeg(pt) {
  return pt === null ? null : [pt[0], mod(-pt[1])];
}

function pointSub(p1, p2) {
  return pointAdd(p1, pointNeg(p2));
}

function scalarMult(k, pt) {
  k = mod(BigInt(k), N);
  let R = null, Q = pt;
  while (k > 0n) {
    if (k & 1n) R = pointAdd(R, Q);
    Q = pointAdd(Q, Q);
    k >>= 1n;
  }
  return R;
}

function isOnCurve(pt) {
  if (pt === null) return true;
  const [x, y] = pt;
  return mod(y * y - (x * x * x + A * x + B)) === 0n;
}

function samePoint(p1, p2) {
  if (p1 === null || p2 === null) return p1 === p2;
  return p1[0] === p2[0] && p1[1] === p2[1];
}

// 33-byte compressed SEC encoding, only used for display.
function hex(n, width = 64) {
  return n.toString(16).padStart(width, "0");
}

function compress(pt) {
  if (pt === null) return "00";
  return (pt[1] & 1n ? "03" : "02") + hex(pt[0]);
}

// ---------------------------------------------------------------- randomness

function randomBigInt(bytes) {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  return x;
}

// uniform in [lo, hi], rejection sampling so there is no modulo bias
function randomInRange(lo, hi) {
  const span = hi - lo + 1n;
  const bits = span.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const excess = BigInt(bytes * 8 - bits);
  for (;;) {
    const x = randomBigInt(bytes) >> excess;
    if (x < span) return lo + x;
  }
}

// ---------------------------------------------------------------- toy scheme

function keygen(keyBits) {
  const k = randomInRange(1n, 1n << BigInt(keyBits));
  return { k, Q: scalarMult(k, G) };
}

// (b+1)G for b = 0..255, built once by repeated addition
let msgTable = null;
function messageTable() {
  if (msgTable) return msgTable;
  const pts = [];
  const byX = new Map();
  let R = null;
  for (let b = 0; b < 256; b++) {
    R = pointAdd(R, G);
    pts.push(R);
    byX.set(R[0], b);
  }
  msgTable = { pts, byX };
  return msgTable;
}

function encodeByte(b) {
  return messageTable().pts[b];
}

function decodePoint(M) {
  if (M === null) return -1;
  const b = messageTable().byX.get(M[0]);
  // x alone is ambiguous between M and -M, so check y as well
  if (b === undefined || !samePoint(messageTable().pts[b], M)) return -1;
  return b;
}

// fixedR is only there to demonstrate what goes wrong if r is reused
function encrypt(text, Q, fixedR = null) {
  const bytes = new TextEncoder().encode(text);
  const out = [];
  for (const b of bytes) {
    const r = fixedR !== null ? fixedR : randomInRange(1n, N - 1n);
    const C1 = scalarMult(r, G);
    const C2 = pointAdd(encodeByte(b), scalarMult(r, Q));
    out.push({ C1, C2 });
  }
  return out;
}

function decryptBytes(cipher, k) {
  return cipher.map(({ C1, C2 }) => decodePoint(pointSub(C2, scalarMult(k, C1))));
}

function decrypt(cipher, k) {
  const bytes = decryptBytes(cipher, k);
  if (bytes.some((b) => b < 0)) return null;
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ---------------------------------------------------------------- attacks

// Jacobian coordinates (X, Y, Z) stand for the affine point (X/Z^2, Y/Z^3).
// Adding an affine point to a Jacobian one needs no modular inverse, which is
// what makes the affine pointAdd above slow (one extended Euclid per addition).
// Only used by the exhaustive search, where the same G is added millions of times.
function jacobianAddAffine([X1, Y1, Z1], [x2, y2]) {
  const Z1Z1 = mod(Z1 * Z1);
  const U2 = mod(x2 * Z1Z1);
  const S2 = mod(y2 * Z1 * Z1Z1);
  const H = mod(U2 - X1);
  const r = mod(S2 - Y1);
  if (H === 0n) return null; // doubling or O: never reached inside the search range
  const HH = mod(H * H);
  const HHH = mod(H * HH);
  const V = mod(X1 * HH);
  const X3 = mod(r * r - HHH - 2n * V);
  const Y3 = mod(r * (V - X3) - Y1 * HHH);
  const Z3 = mod(Z1 * H);
  return [X3, Y3, Z3];
}

// R == Q  <=>  X == Qx Z^2  and  Y == Qy Z^3
function jacobianEquals([X, Y, Z], [qx, qy]) {
  const ZZ = mod(Z * Z);
  return mod(qx * ZZ) === X && mod(qy * ZZ * Z) === Y;
}

// (1) Exhaustive search on the public key: walk R = G, 2G, 3G, ... until R = Q.
// One point addition per candidate. Runs in slices so a browser page can stay
// responsive; onProgress gets (candidatesTried) after every slice.
async function bruteForceKey(Q, maxK, { slice = 20000, onProgress } = {}) {
  const t0 = Date.now();
  if (samePoint(Q, G)) return { k: 1n, tried: 1n, ms: 0 };
  const G2 = pointAdd(G, G);
  let R = [G2[0], G2[1], 1n]; // 2G, so the walk never has to double
  let k = 2n;
  while (k <= maxK) {
    const stop = k + BigInt(slice) - 1n < maxK ? k + BigInt(slice) - 1n : maxK;
    for (; k <= stop; k++) {
      if (jacobianEquals(R, Q)) return { k, tried: k, ms: Date.now() - t0 };
      R = jacobianAddAffine(R, G);
    }
    if (onProgress) await onProgress(k - 1n);
  }
  return { k: null, tried: maxK, ms: Date.now() - t0 };
}

// (2) Same search but without the public key: only one ciphertext block (C1, C2).
// For each candidate k we test whether D = C2 - kC1 falls in the 256-point message
// table. D is walked as D_k = D_{k-1} - C1; the table lookup needs the affine x,
// so here we cannot skip the inverse and this is slower than (1).
async function bruteForceFromCiphertext(block, maxK, { slice = 20000, onProgress } = {}) {
  const { C1, C2 } = block;
  const negC1 = pointNeg(C1);
  let D = pointAdd(C2, negC1);
  let k = 1n;
  const t0 = Date.now();
  while (k <= maxK) {
    const stop = k + BigInt(slice) - 1n < maxK ? k + BigInt(slice) - 1n : maxK;
    for (; k <= stop; k++) {
      if (decodePoint(D) >= 0) return { k, tried: k, ms: Date.now() - t0 };
      D = pointAdd(D, negC1);
    }
    if (onProgress) await onProgress(k - 1n);
  }
  return { k: null, tried: maxK, ms: Date.now() - t0 };
}

// (3) Baby-step giant-step on [1, maxK]: write k = i*m + j with m = ceil(sqrt(maxK)).
// Baby steps: store jG for j = 0..m-1. Giant steps: Q - i*(mG) for i = 0..m.
// About 2*sqrt(maxK) additions and sqrt(maxK) stored points.
async function bsgs(Q, maxK, { slice = 20000, onProgress } = {}) {
  const t0 = Date.now();
  let m = 1n;
  while (m * m < maxK) m++;

  const table = new Map(); // x-coordinate -> j
  let R = null; // jG
  let ops = 0;
  for (let j = 0n; j < m; j++) {
    const key = R === null ? -1n : R[0];
    if (!table.has(key)) table.set(key, j);
    R = pointAdd(R, G);
    ops++;
    if (ops % slice === 0 && onProgress) await onProgress("baby", j, m);
  }

  const mG = R; // R = mG after the loop
  const negMG = pointNeg(mG);
  let gamma = Q;
  for (let i = 0n; i <= m; i++) {
    const key = gamma === null ? -1n : gamma[0];
    const j = table.get(key);
    if (j !== undefined) {
      // x match means gamma = +jG or -jG; check both
      for (const cand of [i * m + j, i * m - j]) {
        if (cand >= 1n && samePoint(scalarMult(cand, G), Q)) {
          return { k: cand, babySteps: m, giantSteps: i + 1n, ms: Date.now() - t0 };
        }
      }
    }
    gamma = pointAdd(gamma, negMG);
    ops++;
    if (ops % slice === 0 && onProgress) await onProgress("giant", i, m);
  }
  return { k: null, babySteps: m, giantSteps: m + 1n, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- design flaws (no key search)

// (4) If the same r is used for every byte, C2_i = M_i + S with S = rQ fixed, so equal
// bytes give equal C2 -- a substitution cipher on bytes. Guess the most frequent C2 is a
// space, get S, and every block falls out. k is never touched.
function attackReusedNonce(cipher, guessByte = 0x20) {
  const freq = new Map();
  for (const { C2 } of cipher) {
    const key = compress(C2);
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const [topKey] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  const topC2 = cipher.find(({ C2 }) => compress(C2) === topKey).C2;
  const S = pointSub(topC2, encodeByte(guessByte));
  const bytes = cipher.map(({ C2 }) => decodePoint(pointSub(C2, S)));
  return {
    distinctC1: new Set(cipher.map(({ C1 }) => compress(C1))).size,
    distinctC2: freq.size,
    topCount: freq.get(topKey),
    text: bytes.some((b) => b < 0) ? null : new TextDecoder().decode(new Uint8Array(bytes)),
  };
}

// (5) Malleability: (C1, C2 + dG) is a valid encryption of byte b + d, made without any key.
function shiftCiphertext(cipher, d) {
  const D = scalarMult(BigInt(d), G); // negative d works: scalarMult reduces mod n
  return cipher.map(({ C1, C2 }) => ({ C1, C2: pointAdd(C2, D) }));
}

// rough cost of one affine addition, used to extrapolate attack times
function benchmarkAdd(count = 5000) {
  let R = pointAdd(G, G);
  let t0 = performance.now();
  for (let i = 0; i < count; i++) R = pointAdd(R, G);
  const affine = (count / (performance.now() - t0)) * 1000;

  let J = [R[0], R[1], 1n];
  t0 = performance.now();
  for (let i = 0; i < count; i++) J = jacobianAddAffine(J, G);
  const jacobian = (count / (performance.now() - t0)) * 1000;
  return { affine, jacobian };
}

const api = {
  P, N, A, B, G,
  mod, modInverse, pointAdd, pointNeg, pointSub, scalarMult, isOnCurve, samePoint,
  hex, compress, randomInRange,
  keygen, encodeByte, decodePoint, encrypt, decrypt, decryptBytes,
  bruteForceKey, bruteForceFromCiphertext, bsgs, attackReusedNonce, shiftCiphertext, benchmarkAdd,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.ECC = api;

})(typeof window !== "undefined" ? window : globalThis);
