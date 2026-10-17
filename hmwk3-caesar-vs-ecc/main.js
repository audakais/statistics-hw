"use strict";

// Page wiring for HMWK3. All the cryptography lives in ecc.js and caesar.js;
// this file only reads the inputs, calls them and draws the results.

const $ = (id) => document.getElementById(id);
const model = Caesar.makeModel(CORPUS_STATS);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const EXP_LENGTHS = [3, 5, 8, 10, 15, 20, 30, 50, 100, 200, 500];
const EXP_SEED = 2024;

const state = { k: null, Q: null, bits: 20, cipher: null, message: "", bench: null };

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

function short(hexStr, keep = 10) {
  return hexStr.length <= 2 * keep + 3 ? hexStr : hexStr.slice(0, keep) + "…" + hexStr.slice(-keep);
}

function fmtInt(n) {
  return BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDuration(sec) {
  if (sec < 1e-3) return "< 1 ms";
  if (sec < 1) return (sec * 1000).toFixed(0) + " ms";
  if (sec < 60) return sec.toFixed(1) + " s";
  if (sec < 3600) return (sec / 60).toFixed(1) + " min";
  if (sec < 86400) return (sec / 3600).toFixed(1) + " h";
  const years = sec / (365.25 * 86400);
  if (years < 1) return (sec / 86400).toFixed(1) + " days";
  if (years < 1e6) return years.toFixed(years < 10 ? 1 : 0) + " years";
  return years.toExponential(1).replace("e+", "·10^") + " years";
}

function fmtBytes(b) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let i = 0;
  while (b >= 1000 && i < units.length - 1) { b /= 1000; i++; }
  if (b >= 1000) return b.toExponential(1).replace("e+", "·10^") + " " + units[i];
  return b.toFixed(b < 10 ? 1 : 0) + " " + units[i];
}

// ---------------------------------------------------------------- charts

function barChart(canvas, series, labels, colors) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1e-9, ...series.flat());
  const n = labels.length;
  const groupW = w / n;
  const barW = (groupW - 3) / series.length;
  const padBottom = 16;
  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  for (let i = 0; i < n; i++) {
    series.forEach((vals, s) => {
      const barH = (vals[i] / max) * (h - padBottom - 8);
      ctx.fillStyle = colors[s];
      ctx.fillRect(i * groupW + 1.5 + s * barW, h - padBottom - barH, barW - 1, barH);
    });
    ctx.fillStyle = css("--muted");
    ctx.fillText(labels[i], i * groupW + groupW / 2, h - 4);
  }
}

function lineChart(canvas, xLabels, series) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const left = 42, right = 14, top = 12, bottom = 30;
  ctx.clearRect(0, 0, w, h);
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.strokeStyle = css("--border");
  ctx.fillStyle = css("--muted");
  ctx.textAlign = "right";
  for (let p = 0; p <= 100; p += 25) {
    const y = top + (1 - p / 100) * (h - top - bottom);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
    ctx.fillText(p + "%", left - 6, y + 3);
  }
  const xAt = (i) => left + (i / (xLabels.length - 1)) * (w - left - right);
  ctx.textAlign = "center";
  xLabels.forEach((l, i) => ctx.fillText(l, xAt(i), h - 12));
  ctx.fillText("ciphertext length (letters)", (left + w - right) / 2, h - 1);
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const y = top + (1 - v) * (h - top - bottom);
      if (i === 0) ctx.moveTo(xAt(i), y); else ctx.lineTo(xAt(i), y);
    });
    ctx.stroke();
    s.values.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(xAt(i), top + (1 - v) * (h - top - bottom), 2.5, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.lineWidth = 1;
}

const METHOD_COLORS = () => ({
  top: css("--redpen"),
  chi2: css("--brass"),
  dictionary: css("--muted"),
  trigram: css("--verdigris"),
});

// ---------------------------------------------------------------- 01 toy ECC

function keygen() {
  const bits = Math.max(4, Math.min(40, parseInt($("keyBits").value, 10) || 20));
  $("keyBits").value = bits;
  const { k, Q } = ECC.keygen(bits);
  Object.assign(state, { k, Q, bits });
  $("keyOut").textContent =
    `private key k = ${fmtInt(k)}   (drawn uniformly from [1, 2^${bits}] = [1, ${fmtInt(1n << BigInt(bits))}])\n` +
    `public key  Q = kG\n` +
    `  x = ${ECC.hex(Q[0])}\n` +
    `  y = ${ECC.hex(Q[1])}\n` +
    `  compressed: ${ECC.compress(Q)}\n` +
    `  on curve: ${ECC.isOnCurve(Q)}`;
  encryptAll();
}

function encryptAll() {
  const msg = $("msgInput").value;
  state.message = msg;
  state.cipher = ECC.encrypt(msg, state.Q);
  const bytes = new TextEncoder().encode(msg);

  const SHOW = 12;
  const lines = state.cipher.slice(0, SHOW).map(({ C1, C2 }, i) => {
    const b = bytes[i];
    const ch = b >= 32 && b < 127 ? `'${String.fromCharCode(b)}'` : `0x${b.toString(16)}`;
    return `#${String(i).padStart(2)} ${ch.padEnd(5)} C1 = ${short(ECC.compress(C1))}   C2 = ${short(ECC.compress(C2))}`;
  });
  if (state.cipher.length > SHOW) lines.push(`… ${state.cipher.length - SHOW} more blocks`);
  $("eccCipherOut").textContent =
    `${bytes.length} bytes -> ${state.cipher.length} blocks (C1, C2), ${state.cipher.length * 66} bytes compressed\n\n` +
    lines.join("\n");

  const t0 = performance.now();
  const dec = ECC.decrypt(state.cipher, state.k);
  const ms = performance.now() - t0;
  const wrong = ECC.decryptBytes(state.cipher, state.k + 1n);
  const undecodable = wrong.filter((b) => b < 0).length;
  $("eccDecOut").textContent =
    `decrypt with k:      "${dec}"   (${ms.toFixed(0)} ms)\n` +
    `round trip correct:  ${dec === msg}\n` +
    `decrypt with k + 1:  ${undecodable} of ${wrong.length} blocks do not land on any of the 256 message points`;

  runCaesar();
}

// ---------------------------------------------------------------- 02 Caesar

function runCaesar() {
  const s = ((parseInt($("caesarKey").value, 10) || 0) % 26 + 26) % 26;
  $("caesarKey").value = s;
  const msg = state.message;
  const c = Caesar.encrypt(msg, s);
  const d = Caesar.decrypt(c, s);
  $("caesarOut").textContent =
    `plaintext:   ${msg}\n` +
    `key s = ${s}   (${LETTERS.slice(0, 5).join("")}… -> ${LETTERS.map((_, i) => LETTERS[(i + s) % 26]).slice(0, 5).join("")}…)\n` +
    `ciphertext:  ${c}\n` +
    `decrypted:   ${d}\n` +
    `round trip correct: ${d === msg}`;
  updateComparison(msg, c);
  fillPresets(c, s);
}

// ---------------------------------------------------------------- 03 comparison

function updateComparison(plain, caesarCipher) {
  const pc = Caesar.letterCounts(plain);
  const cc = Caesar.letterCounts(caesarCipher);
  barChart($("cmpHist"), [pc, cc], LETTERS, [css("--verdigris"), css("--brass")]);

  const bytes = new TextEncoder().encode(plain);
  const byteFreq = new Map();
  for (const b of bytes) byteFreq.set(b, (byteFreq.get(b) || 0) + 1);
  const [topByte, topByteCount] = [...byteFreq.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];

  const c2Freq = new Map();
  let ones = 0, totalBits = 0;
  for (const { C2 } of state.cipher) {
    const key = ECC.compress(C2);
    c2Freq.set(key, (c2Freq.get(key) || 0) + 1);
    for (const ch of ECC.hex(C2[0])) {
      const v = parseInt(ch, 16);
      ones += (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);
      totalBits += 4;
    }
  }
  const maxC2 = Math.max(0, ...c2Freq.values());
  const topChar = topByte === 32 ? "space" : `'${String.fromCharCode(topByte)}'`;

  $("cmpStats").textContent =
    `CAESAR\n` +
    `  index of coincidence, plaintext:   ${Caesar.indexOfCoincidence(pc).toFixed(4)}\n` +
    `  index of coincidence, ciphertext:  ${Caesar.indexOfCoincidence(cc).toFixed(4)}\n` +
    `  (English ≈ ${Caesar.indexOfCoincidence(CORPUS_STATS.uni).toFixed(4)}, uniform = ${(1 / 26).toFixed(4)})\n` +
    `  sorted counts identical: ${JSON.stringify([...pc].sort((a, b) => b - a)) === JSON.stringify([...cc].sort((a, b) => b - a))}\n\n` +
    `TOY EC-ElGamal\n` +
    `  plaintext: ${bytes.length} bytes, ${byteFreq.size} distinct\n` +
    `  most common byte: ${topChar}, ${topByteCount} times\n` +
    `  distinct C2 points: ${c2Freq.size} of ${state.cipher.length}\n` +
    `  most repeated C2: ${maxC2} time(s)\n` +
    `  share of 1-bits in all C2.x: ${totalBits ? (ones / totalBits).toFixed(3) : "-"}`;
}

// ---------------------------------------------------------------- 04 cryptanalysis

function drawReference() {
  const p = CORPUS_STATS.uni.map((c) => c / CORPUS_STATS.totalLetters);
  barChart($("refHist"), [p], LETTERS, [css("--brass")]);
  const order = p.map((v, i) => [LETTERS[i], v]).sort((a, b) => b[1] - a[1]);
  $("refInfo").textContent =
    `${CORPUS_STATS.source}\n` +
    `${fmtInt(CORPUS_STATS.totalLetters)} letters, index of coincidence ${Caesar.indexOfCoincidence(CORPUS_STATS.uni).toFixed(4)}\n` +
    `order: ${order.map(([l]) => l).join("")}\n` +
    `top six: ${order.slice(0, 6).map(([l, v]) => `${l} ${(100 * v).toFixed(2)}%`).join("  ")}\n` +
    `most common words: ${CORPUS_STATS.topWords.slice(0, 12).join(", ")}`;
}

const EXAMPLES = [
  "Fuzzy jazz buzz",
  "A lazy fox jumps quickly",
  "XYZ QRS KJV",
  "Il gatto dorme sul divano della nonna mentre fuori piove da ore.",
  "Domani alle otto davanti alla stazione centrale",
  "It was the best of times, it was the worst of times",
];

function fillPresets(myCipher, myKey) {
  const sel = $("anaPreset");
  const prev = sel.value;
  sel.innerHTML = "";
  const add = (label, value) => {
    const o = document.createElement("option");
    o.textContent = label;
    o.value = value;
    sel.appendChild(o);
  };
  add(`my message (key ${myKey})`, myCipher);
  for (const e of EXAMPLES) add(`"${e.length > 28 ? e.slice(0, 28) + "…" : e}" (key 11)`, Caesar.encrypt(e, 11));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  if (!$("anaInput").value) { $("anaInput").value = sel.value; analyze(); }
}

function analyze() {
  const cipher = $("anaInput").value;
  const ranks = {};
  for (const m of ["chi2", "dictionary", "trigram"]) ranks[m] = Caesar.rankKeys(model, cipher, m);
  const top = Caesar.attack(model, cipher, "top");
  const best = { chi2: ranks.chi2[0].key, dictionary: ranks.dictionary[0].key, trigram: ranks.trigram[0].key };
  const scoreOf = (m, key) => ranks[m].find((r) => r.key === key).score;
  const rankOf = (m, key) => ranks[m].findIndex((r) => r.key === key) + 1;

  let html = `<table class="defs num-table"><thead><tr><th>method</th><th>key found</th><th>decryption</th></tr></thead><tbody>`;
  const pairs = [["top", top], ["chi2", best.chi2], ["dictionary", best.dictionary], ["trigram", best.trigram]];
  for (const [id, key] of pairs) {
    const label = Caesar.METHODS.find((m) => m.id === id).label;
    const text = Caesar.decrypt(cipher, key);
    html += `<tr><td>${label}</td><td>${key}</td><td style="text-align:left">${escapeHtml(text.slice(0, 60))}${text.length > 60 ? "…" : ""}</td></tr>`;
  }
  html += `</tbody></table>`;

  html += `<table class="defs num-table"><thead><tr><th>key</th><th>&chi;&sup2;</th><th>rank</th><th>trigram log-lik.</th><th>rank</th><th>dict. words</th><th>rank</th><th style="text-align:left">decryption</th></tr></thead><tbody>`;
  for (let key = 0; key < 26; key++) {
    const cls = (m) => (best[m] === key ? ` class="best"` : "");
    const text = Caesar.decrypt(cipher, key);
    html +=
      `<tr><td>${key}</td>` +
      `<td${cls("chi2")}>${(-scoreOf("chi2", key)).toFixed(1)}</td><td>${rankOf("chi2", key)}</td>` +
      `<td${cls("trigram")}>${scoreOf("trigram", key).toFixed(1)}</td><td>${rankOf("trigram", key)}</td>` +
      `<td${cls("dictionary")}>${Math.floor(scoreOf("dictionary", key))}</td><td>${rankOf("dictionary", key)}</td>` +
      `<td style="text-align:left">${escapeHtml(text.slice(0, 34))}${text.length > 34 ? "…" : ""}</td></tr>`;
  }
  html += `</tbody></table>`;
  $("anaOut").innerHTML = html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------- 05 experiment

async function runExperiment() {
  const trials = Math.max(50, parseInt($("expTrials").value, 10) || 1000);
  const stripSpaces = $("expStrip").checked;
  $("expBtn").disabled = true;
  const rows = [];
  // one shared generator across all lengths, exactly like Caesar.runExperiment,
  // so the numbers match tools/experiments.js; split up only to redraw in between
  const rand = Caesar.rng(EXP_SEED);
  for (let i = 0; i < EXP_LENGTHS.length; i++) {
    rows.push(Caesar.experimentRow(model, TEST_TEXT, EXP_LENGTHS[i], trials, rand, stripSpaces));
    $("expProgress").value = (i + 1) / EXP_LENGTHS.length;
    renderExperiment(rows, trials, stripSpaces);
    await yieldToBrowser();
  }
  $("expBtn").disabled = false;
}

function renderExperiment(rows, trials, stripSpaces) {
  let html = `<table class="defs num-table"><thead><tr><th>letters</th>` +
    Caesar.METHODS.map((m) => `<th>${m.label}</th>`).join("") + `</tr></thead><tbody>`;
  for (const r of rows) {
    const bestVal = Math.max(...Object.values(r.accuracy));
    html += `<tr><td>${r.length}</td>` + Caesar.METHODS.map((m) => {
      const v = r.accuracy[m.id];
      const cls = v === bestVal ? "best" : v < 0.5 ? "bad" : "";
      return `<td class="${cls}">${(100 * v).toFixed(1)}%</td>`;
    }).join("") + `</tr>`;
  }
  html += `</tbody></table><p class="hint">${trials} trials per length, seed ${EXP_SEED}, ${stripSpaces ? "letters only" : "spaces and punctuation kept"}. Green = best method for that length, red = below 50%.</p>`;
  $("expTable").innerHTML = html;

  const colors = METHOD_COLORS();
  lineChart($("expChart"), EXP_LENGTHS.map(String),
    Caesar.METHODS.map((m) => ({
      color: colors[m.id],
      values: EXP_LENGTHS.map((L, i) => (rows[i] ? rows[i].accuracy[m.id] : NaN)).filter((v) => !Number.isNaN(v)),
    })));
  $("expLegend").innerHTML = Caesar.METHODS.map((m) => `<span style="--c:${colors[m.id]}">${m.label}</span>`).join("");
}

// ---------------------------------------------------------------- 06 attacks

let stopRequested = false;

function attackButtons(running) {
  for (const id of ["atkBruteBtn", "atkCipherBtn", "atkBsgsBtn", "keygenBtn", "encryptBtn"]) $(id).disabled = running;
  $("atkStopBtn").disabled = !running;
}

async function runAttack(kind) {
  stopRequested = false;
  attackButtons(true);
  const maxK = 1n << BigInt(state.bits);
  const out = $("atkOut");
  const bar = $("atkProgress");
  bar.value = 0;
  const header =
    `target: Q = ${short(ECC.compress(state.Q), 14)}\n` +
    `known: k in [1, 2^${state.bits}] = [1, ${fmtInt(maxK)}]\n\n`;

  const check = async () => {
    if (stopRequested) throw new Error("stopped");
    await yieldToBrowser();
  };

  try {
    let res, text;
    if (kind === "brute") {
      out.textContent = header + "1 · walking G, 2G, 3G, … (Jacobian coordinates)";
      res = await ECC.bruteForceKey(state.Q, maxK, {
        onProgress: async (tried) => { bar.value = Number(tried) / Number(maxK); out.textContent = header + `1 · tried ${fmtInt(tried)} candidates…`; await check(); },
      });
      text = `1 · exhaustive search on Q\n  candidates tried: ${fmtInt(res.tried)}\n  rate: ${fmtInt(Math.round(Number(res.tried) / Math.max(res.ms, 1) * 1000))} keys/s`;
    } else if (kind === "cipher") {
      out.textContent = header + "2 · testing C2 - kC1 against the 256 message points";
      res = await ECC.bruteForceFromCiphertext(state.cipher[0], maxK, {
        onProgress: async (tried) => { bar.value = Number(tried) / Number(maxK); out.textContent = header + `2 · tried ${fmtInt(tried)} candidates…`; await check(); },
      });
      text = `2 · exhaustive search from the first ciphertext block only (Q not used)\n  candidates tried: ${fmtInt(res.tried)}\n  rate: ${fmtInt(Math.round(Number(res.tried) / Math.max(res.ms, 1) * 1000))} keys/s`;
    } else {
      out.textContent = header + "3 · baby steps…";
      res = await ECC.bsgs(state.Q, maxK, {
        onProgress: async (phase, i, m) => {
          bar.value = phase === "baby" ? Number(i) / Number(m) / 2 : 0.5 + Number(i) / Number(m) / 2;
          out.textContent = header + `3 · ${phase} step ${fmtInt(i)} of ${fmtInt(m)}`;
          await check();
        },
      });
      text = `3 · baby-step giant-step\n  m = ${fmtInt(res.babySteps)} baby steps stored, ${fmtInt(res.giantSteps)} giant steps used`;
    }
    bar.value = 1;
    const ok = res.k !== null && ECC.samePoint(ECC.scalarMult(res.k, ECC.G), state.Q);
    const plain = res.k !== null ? ECC.decrypt(state.cipher, res.k) : null;
    out.textContent = header + text +
      `\n  time: ${fmtDuration(res.ms / 1000)}\n\n` +
      `recovered k = ${res.k === null ? "not found" : fmtInt(res.k)}   (real k = ${fmtInt(state.k)})\n` +
      `check kG = Q: ${ok}\n` +
      `message decrypted with recovered k: ${plain === null ? "-" : `"${plain}"`}`;
    out.className = "mono small data-block " + (ok ? "good" : "bad");
  } catch (e) {
    if (e.message !== "stopped") throw e;
    out.textContent += "\n\nstopped by user.";
    out.className = "mono small data-block bad";
  } finally {
    attackButtons(false);
  }
}

function renderExtrapolation() {
  if (!state.bench) state.bench = ECC.benchmarkAdd(4000);
  const { affine, jacobian } = state.bench;
  const FAST = 1e12;
  const rows = [
    [state.bits, `toy key (current, b = ${state.bits})`],
    [32, ""], [48, ""], [64, ""], [80, ""], [128, ""],
    [256, "full secp256k1 key, n ≈ 2^256"],
  ];
  let html =
    `<p class="mono small">this browser: ${fmtInt(Math.round(affine))} affine additions/s, ` +
    `${fmtInt(Math.round(jacobian))} Jacobian additions/s (${(jacobian / affine).toFixed(1)}× faster)</p>` +
    `<table class="defs num-table"><thead><tr><th>key bits b</th><th>exhaustive, 2<sup>b</sup><br>(this browser)</th>` +
    `<th>BSGS, 2·2<sup>b/2</sup><br>(this browser)</th><th>BSGS table<br>2<sup>b/2</sup> × 32 B</th>` +
    `<th>2·2<sup>b/2</sup> ops at<br>10<sup>12</sup>/s</th></tr></thead><tbody>`;
  for (const [b, note] of rows) {
    const space = Math.pow(2, b);
    const sq = 2 * Math.pow(2, b / 2);
    html += `<tr><td>${b}${note ? `<br><span class="hint">${note}</span>` : ""}</td>` +
      `<td>${fmtDuration(space / jacobian)}</td>` +
      `<td>${fmtDuration(sq / affine)}</td>` +
      `<td>${fmtBytes(Math.pow(2, b / 2) * 32)}</td>` +
      `<td>${fmtDuration(sq / FAST)}</td></tr>`;
  }
  html += `</tbody></table><p class="hint">For comparison, the age of the universe is about 1.4·10^10 years.</p>`;
  $("extrapTable").innerHTML = html;
}

// ---------------------------------------------------------------- 07 design flaws

function demoReuse() {
  const r = ECC.randomInRange(1n, ECC.N - 1n);
  const bad = ECC.encrypt(state.message, state.Q, r);
  const res = ECC.attackReusedNonce(bad);
  $("designOut").textContent =
    `same r for every byte:\n` +
    `  distinct C1: ${res.distinctC1} (always the same point, so the reuse is visible)\n` +
    `  distinct C2: ${res.distinctC2} for ${bad.length} bytes; most frequent C2 appears ${res.topCount} times\n` +
    `  guess: most frequent C2 = space  ->  S = C2 - 33G\n` +
    `  recovered without k: ${res.text === null ? "failed (guess wrong: the most common byte is not a space)" : `"${res.text}"`}`;
}

function demoMalleability() {
  const shifted = ECC.shiftCiphertext(state.cipher, 1);
  const dec = ECC.decrypt(shifted, state.k);
  $("designOut").textContent =
    `C2 -> C2 + G for every block (done without knowing k or r):\n` +
    `  original:  "${state.message}"\n` +
    `  receiver decrypts the modified ciphertext as:\n` +
    `             "${dec === null ? "(some byte went past 255 or formed invalid UTF-8)" : dec}"`;
}

// ---------------------------------------------------------------- init

function init() {
  $("keygenBtn").addEventListener("click", keygen);
  $("encryptBtn").addEventListener("click", encryptAll);
  $("caesarBtn").addEventListener("click", runCaesar);
  $("anaBtn").addEventListener("click", analyze);
  $("anaPreset").addEventListener("change", () => { $("anaInput").value = $("anaPreset").value; analyze(); });
  $("expBtn").addEventListener("click", runExperiment);
  $("atkBruteBtn").addEventListener("click", () => runAttack("brute"));
  $("atkCipherBtn").addEventListener("click", () => runAttack("cipher"));
  $("atkBsgsBtn").addEventListener("click", () => runAttack("bsgs"));
  $("atkStopBtn").addEventListener("click", () => { stopRequested = true; });
  $("benchBtn").addEventListener("click", () => { state.bench = ECC.benchmarkAdd(4000); renderExtrapolation(); });
  $("keyBits").addEventListener("change", () => { keygen(); renderExtrapolation(); });
  $("reuseBtn").addEventListener("click", demoReuse);
  $("mallBtn").addEventListener("click", demoMalleability);

  drawReference();
  keygen();
  renderExtrapolation();
  runExperiment();
}

init();
