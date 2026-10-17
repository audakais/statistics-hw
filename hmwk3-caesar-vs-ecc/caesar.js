"use strict";

// Caesar cipher on the 26 Latin letters (case kept, everything else left as is)
// plus four ways to recover the key from ciphertext alone. All the language
// statistics come from CORPUS_STATS (see tools/build-corpus.js).

(function (root) {

function shiftChar(ch, key) {
  const c = ch.charCodeAt(0);
  if (c >= 65 && c <= 90) return String.fromCharCode(((c - 65 + key) % 26 + 26) % 26 + 65);
  if (c >= 97 && c <= 122) return String.fromCharCode(((c - 97 + key) % 26 + 26) % 26 + 97);
  return ch;
}

function encrypt(text, key) {
  let out = "";
  for (const ch of text) out += shiftChar(ch, key);
  return out;
}

function decrypt(text, key) {
  return encrypt(text, -key);
}

function letterIndices(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) | 32; // lower-case ASCII letters
    if (c >= 97 && c <= 122) out.push(c - 97);
  }
  return out;
}

function letterCounts(text) {
  const counts = new Array(26).fill(0);
  for (const i of letterIndices(text)) counts[i]++;
  return counts;
}

// index of coincidence: P(two letters drawn without replacement are equal)
function indexOfCoincidence(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n < 2) return 0;
  return counts.reduce((s, c) => s + c * (c - 1), 0) / (n * (n - 1));
}

function makeModel(stats) {
  const uniP = stats.uni.map((c) => c / stats.totalLetters);
  // add-one smoothing so unseen trigrams (e.g. "QZX") get a finite log-probability
  const triTotal = stats.tri.reduce((a, b) => a + b, 0);
  const triLogP = stats.tri.map((c) => Math.log((c + 1) / (triTotal + stats.tri.length)));
  const words = new Set(stats.topWords);
  const mostCommon = uniP.indexOf(Math.max(...uniP));
  return { uniP, triLogP, words, mostCommon };
}

// ---------------------------------------------------------------- scorers
// Each scorer looks at a candidate plaintext and returns a number, higher = more English.

// chi-squared distance between observed letter counts and corpus frequencies (negated)
function scoreChi2(model, counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    const e = n * model.uniP[i];
    chi += (counts[i] - e) ** 2 / e;
  }
  return -chi;
}

// log-likelihood of the letter stream under the trigram model
function scoreTrigram(model, idxs) {
  let s = 0;
  for (let i = 0; i + 2 < idxs.length; i++) s += model.triLogP[(idxs[i] * 26 + idxs[i + 1]) * 26 + idxs[i + 2]];
  return s;
}

// how many of the words are among the 1000 most common corpus words;
// ties broken by how many letters those words cover
function scoreDictionary(model, text) {
  let hits = 0, covered = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (w && model.words.has(w)) { hits++; covered += w.length; }
  }
  return hits + covered / 1e4;
}

// ---------------------------------------------------------------- attacks

// (a) frequency analysis in its simplest form: no search at all.
//     The most frequent ciphertext letter is assumed to be the most frequent
//     corpus letter (E), which fixes the shift.
function attackTopLetter(model, cipher) {
  const counts = letterCounts(cipher);
  const top = counts.indexOf(Math.max(...counts));
  return ((top - model.mostCommon) % 26 + 26) % 26;
}

// (b), (c), (d) try all 26 keys and keep the best-scoring one
function rankKeys(model, cipher, method) {
  const counts = letterCounts(cipher);
  const idxs = letterIndices(cipher);
  const ranking = [];
  for (let key = 0; key < 26; key++) {
    let score;
    if (method === "chi2") {
      // decrypting with `key` maps cipher letter (i + key) to plain letter i
      const shifted = counts.map((_, i) => counts[(i + key) % 26]);
      score = scoreChi2(model, shifted);
    } else if (method === "trigram") {
      score = scoreTrigram(model, idxs.map((i) => (i - key + 26) % 26));
    } else if (method === "dictionary") {
      score = scoreDictionary(model, decrypt(cipher, key));
    } else {
      throw new Error("unknown method " + method);
    }
    ranking.push({ key, score });
  }
  // stable sort: on an exact tie the smaller key wins
  return ranking.sort((a, b) => b.score - a.score);
}

function attack(model, cipher, method) {
  if (method === "top") return attackTopLetter(model, cipher);
  return rankKeys(model, cipher, method)[0].key;
}

const METHODS = [
  { id: "top", label: "most frequent letter = E" },
  { id: "chi2", label: "26 keys, chi-squared on letters" },
  { id: "dictionary", label: "26 keys, dictionary words" },
  { id: "trigram", label: "26 keys, trigram log-likelihood" },
];

// ---------------------------------------------------------------- experiment

// small seeded PRNG (mulberry32) so the experiment table is reproducible
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

// a passage of the test text that starts at a word and contains exactly nLetters letters
function samplePassage(text, nLetters, rand) {
  let start = Math.floor(rand() * (text.length - nLetters * 3));
  while (start > 0 && text[start - 1] !== " ") start++;
  let end = start, seen = 0;
  while (end < text.length && seen < nLetters) {
    const c = text.charCodeAt(end) | 32;
    if (c >= 97 && c <= 122) seen++;
    end++;
  }
  return text.slice(start, end);
}

// one row of the experiment: `trials` random passages of L letters, random key 1..25
function experimentRow(model, text, L, trials, rand, stripSpaces) {
  const correct = Object.fromEntries(METHODS.map((m) => [m.id, 0]));
  for (let t = 0; t < trials; t++) {
    let plain = samplePassage(text, L, rand);
    if (stripSpaces) plain = plain.replace(/[^A-Za-z]/g, "");
    const key = 1 + Math.floor(rand() * 25);
    const cipher = encrypt(plain, key);
    for (const m of METHODS) if (attack(model, cipher, m.id) === key) correct[m.id]++;
  }
  return { length: L, trials, accuracy: Object.fromEntries(METHODS.map((m) => [m.id, correct[m.id] / trials])) };
}

function runExperiment(model, text, { lengths, trials, seed = 1, stripSpaces = false }) {
  const rand = rng(seed);
  return lengths.map((L) => experimentRow(model, text, L, trials, rand, stripSpaces));
}

const api = {
  encrypt, decrypt, letterCounts, letterIndices, indexOfCoincidence,
  makeModel, rankKeys, attack, METHODS, rng, samplePassage, experimentRow, runExperiment,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.Caesar = api;

})(typeof window !== "undefined" ? window : globalThis);
