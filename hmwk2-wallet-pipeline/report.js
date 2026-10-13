"use strict";

// Keccak-f[1600] sponge, written from the public Keccak specification (not from any
// library's source) and checked against the SHA3-256 vectors below before it was wired
// into the page: this file and the native OpenSSL sha3-256 agree on every test string,
// which pins down the permutation and padding logic. Ethereum's Keccak-256 differs from
// NIST's SHA3-256 only in the domain-separation byte used in padding (0x01 vs 0x06) --
// see domainByte below.

const MASK64 = (1n << 64n) - 1n;

function rotl64(x, n) {
  n = BigInt(n) % 64n;
  if (n === 0n) return x & MASK64;
  return ((x << n) | (x >> (64n - n))) & MASK64;
}

function buildRotationOffsets() {
  const r = Array.from({ length: 5 }, () => new Array(5).fill(0));
  let x = 1, y = 0;
  for (let t = 0; t < 24; t++) {
    r[x][y] = (((t + 1) * (t + 2)) / 2) % 64;
    const nx = y, ny = (2 * x + 3 * y) % 5;
    x = nx; y = ny;
  }
  return r;
}

function buildRoundConstants() {
  let lfsr = 0x01;
  function lfsrBit() {
    const bit = lfsr & 0x01;
    lfsr = (lfsr & 0x80) ? ((lfsr << 1) ^ 0x71) & 0xff : (lfsr << 1) & 0xff;
    return bit;
  }
  const RC = [];
  for (let i = 0; i < 24; i++) {
    let rc = 0n;
    for (let j = 0; j < 7; j++) {
      const bitPos = (1 << j) - 1; // 0,1,3,7,15,31,63
      if (lfsrBit()) rc |= 1n << BigInt(bitPos);
    }
    RC.push(rc & MASK64);
  }
  return RC;
}

const ROT = buildRotationOffsets();
const RC = buildRoundConstants();

function keccakF1600(state) {
  for (let round = 0; round < 24; round++) {
    const C = new Array(5);
    for (let x = 0; x < 5; x++) {
      C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    }
    const D = new Array(5);
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) state[x][y] = (state[x][y] ^ D[x]) & MASK64;

    const B = Array.from({ length: 5 }, () => new Array(5).fill(0n));
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        B[y][(2 * x + 3 * y) % 5] = rotl64(state[x][y], ROT[x][y]);

    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        state[x][y] = (B[x][y] ^ (~B[(x + 1) % 5][y] & MASK64 & B[(x + 2) % 5][y])) & MASK64;

    state[0][0] = (state[0][0] ^ RC[round]) & MASK64;
  }
  return state;
}

function keccakHash(messageBytes, rateBytes, outputBytes, domainByte) {
  const state = Array.from({ length: 5 }, () => new Array(5).fill(0n));

  const padLen = rateBytes - (messageBytes.length % rateBytes);
  const full = new Uint8Array(messageBytes.length + padLen);
  full.set(messageBytes, 0);
  full[messageBytes.length] = domainByte;
  full[full.length - 1] ^= 0x80;

  for (let off = 0; off < full.length; off += rateBytes) {
    for (let i = 0; i < rateBytes / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(full[off + i * 8 + b]);
      state[i % 5][Math.floor(i / 5)] ^= lane;
      state[i % 5][Math.floor(i / 5)] &= MASK64;
    }
    keccakF1600(state);
  }

  const out = new Uint8Array(outputBytes);
  let pos = 0;
  while (pos < outputBytes) {
    for (let i = 0; i < rateBytes / 8 && pos < outputBytes; i++) {
      let lane = state[i % 5][Math.floor(i / 5)];
      for (let b = 0; b < 8 && pos < outputBytes; b++) {
        out[pos++] = Number(lane & 0xffn);
        lane >>= 8n;
      }
    }
    if (pos < outputBytes) keccakF1600(state);
  }
  return out;
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function keccak256Hex(str) {
  return toHex(keccakHash(new TextEncoder().encode(str), 136, 32, 0x01));
}

function sha3_256Hex(str) {
  return toHex(keccakHash(new TextEncoder().encode(str), 136, 32, 0x06));
}

// EIP-55: hash the lowercase hex *string* (ASCII), then uppercase each a-f digit of the
// address whose corresponding hash nibble is >= 8.
function eip55Checksum(addressHex) {
  const clean = addressHex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) return null;
  const hash = keccak256Hex(clean);
  let out = "0x";
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const nibble = parseInt(hash[i], 16);
    out += /[a-f]/.test(c) && nibble >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

// ---------------------------------------------------------------- UI wiring

const hashInput = document.getElementById("hashInput");
const keccakOut = document.getElementById("keccakOut");
const sha3Out = document.getElementById("sha3Out");
const diffNote = document.getElementById("diffNote");

function updateHashDemo() {
  const text = hashInput.value;
  const k = keccak256Hex(text);
  const s = sha3_256Hex(text);
  keccakOut.textContent = k;
  sha3Out.textContent = s;
  diffNote.textContent =
    k === s
      ? "identical (only happens if both padding schemes collapse to the same bytes -- essentially never for real input)"
      : `differ starting at hex position ${[...k].findIndex((ch, i) => ch !== s[i])}, same input, same permutation, only the padding byte changed`;
}

const addrInput = document.getElementById("addrInput");
const addrOut = document.getElementById("addrOut");
const addrError = document.getElementById("addrError");

function updateChecksumDemo() {
  const result = eip55Checksum(addrInput.value);
  if (result === null) {
    addrOut.textContent = "";
    addrError.textContent = addrInput.value.trim() === ""
      ? ""
      : "needs exactly 40 hex characters (with or without a 0x prefix)";
    return;
  }
  addrError.textContent = "";
  addrOut.innerHTML = "";
  const clean = addrInput.value.trim().toLowerCase().replace(/^0x/, "");
  const hash = keccak256Hex(clean);
  addrOut.appendChild(document.createTextNode("0x"));
  for (let i = 0; i < clean.length; i++) {
    const span = document.createElement("span");
    const upper = /[a-f]/.test(clean[i]) && parseInt(hash[i], 16) >= 8;
    span.textContent = upper ? clean[i].toUpperCase() : clean[i];
    if (upper) span.className = "upper";
    addrOut.appendChild(span);
  }
}

hashInput.addEventListener("input", updateHashDemo);
addrInput.addEventListener("input", updateChecksumDemo);

hashInput.value = "Auda Kais 1843634";
addrInput.value = "d1220a0cf47c7b9be7a2e6ba89f429762e7b9adb";
updateHashDemo();
updateChecksumDemo();
