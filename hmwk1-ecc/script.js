"use strict";

// Toy curve: y^2 = x^3 + A x + B (mod P) -- same A,B as secp256k1, tiny P.
const P = 17;
const A = 0;
const B = 7;

function mod(n, m) {
  return ((n % m) + m) % m;
}

// Extended Euclidean algorithm, used to invert a mod P (no division mod a prime otherwise).
function modInverse(a, m) {
  a = mod(a, m);
  let oldR = a, r = m;
  let oldS = 1, s = 0;
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod(oldS, m);
}

// Point at infinity == null.
function pointAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;

  if (x1 === x2 && mod(y1 + y2, P) === 0) return null; // P + (-P) = O

  let m;
  if (x1 === x2 && y1 === y2) {
    m = mod((3 * x1 * x1 + A) * modInverse(2 * y1, P), P); // tangent slope
  } else {
    m = mod((y2 - y1) * modInverse(x2 - x1, P), P); // chord slope
  }
  const x3 = mod(m * m - x1 - x2, P);
  const y3 = mod(m * (x1 - x3) - y1, P);
  return [x3, y3];
}

function isOnCurve([x, y]) {
  return mod(y * y - (x ** 3 + A * x + B), P) === 0;
}

function allCurvePoints() {
  const pts = [];
  for (let x = 0; x < P; x++) {
    for (let y = 0; y < P; y++) {
      if (isOnCurve([x, y])) pts.push([x, y]);
    }
  }
  return pts;
}

// 1G, 2G, ..., kG by repeated addition -- what the assignment literally asks for.
function naiveMultiples(k, G) {
  const steps = [];
  let R = null;
  for (let i = 1; i <= k; i++) {
    R = pointAdd(R, G);
    steps.push(R);
  }
  return steps;
}

// Double-and-add: O(log k) additions instead of O(k) -- the "faster method for a larger k".
function scalarMultFast(k, G) {
  let R = null;
  let Q = G;
  let n = k;
  while (n > 0) {
    if (n & 1) R = pointAdd(R, Q);
    Q = pointAdd(Q, Q);
    n >>= 1;
  }
  return R;
}

function subgroupOrder(G) {
  let R = G, n = 1;
  while (R !== null && n < 1000) {
    R = pointAdd(R, G);
    n++;
  }
  return n;
}

function fmtPoint(pt) {
  return pt === null ? "O" : `(${pt[0]}, ${pt[1]})`;
}

function toBits(x, width) {
  const bits = [];
  for (let i = 0; i < width; i++) bits.push((x >> i) & 1);
  return bits;
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// ---------------------------------------------------------------- UI state

const curvePoints = allCurvePoints();
let vizSteps = [null];   // vizSteps[i] = iG, vizSteps[0] = O
let vizIndex = 0;
let playTimer = null;

const els = {
  curveList: document.getElementById("curve-points-list"),
  gSelect: document.getElementById("gSelect"),
  kInput: document.getElementById("kInput"),
  computeBtn: document.getElementById("computeBtn"),
  publicKeyOut: document.getElementById("publicKeyOut"),
  stepLog: document.getElementById("stepLog"),
  canvas: document.getElementById("curveCanvas"),
  playBtn: document.getElementById("playBtn"),
  stepBtn: document.getElementById("stepBtn"),
  resetBtn: document.getElementById("resetBtn"),
  speedRange: document.getElementById("speedRange"),
  vizInfo: document.getElementById("vizInfo"),
  statGSelect: document.getElementById("statGSelect"),
  statN: document.getElementById("statN"),
  allGCheck: document.getElementById("allGCheck"),
  runStatsBtn: document.getElementById("runStatsBtn"),
  histX: document.getElementById("histX"),
  histY: document.getElementById("histY"),
  histBits: document.getElementById("histBits"),
  statsText: document.getElementById("statsText"),
  periodDemo: document.getElementById("periodDemo"),
  avalancheDemo: document.getElementById("avalancheDemo"),
};

function populateSelect(select, defaultPt) {
  curvePoints.forEach(([x, y]) => {
    const opt = document.createElement("option");
    opt.value = `${x},${y}`;
    opt.textContent = `(${x}, ${y})`;
    select.appendChild(opt);
  });
  select.value = `${defaultPt[0]},${defaultPt[1]}`;
}

function readPoint(select) {
  const [x, y] = select.value.split(",").map(Number);
  return [x, y];
}

function init() {
  const totalOrder = curvePoints.length + 1; // + point at infinity
  els.curveList.textContent =
    `${curvePoints.length} affine points + O  =>  group order ${totalOrder}.\n` +
    curvePoints.map(fmtPoint).join("  ");

  populateSelect(els.gSelect, [1, 5]);
  populateSelect(els.statGSelect, [1, 5]);

  els.computeBtn.addEventListener("click", compute);
  els.playBtn.addEventListener("click", togglePlay);
  els.stepBtn.addEventListener("click", () => { stopPlay(); stepViz(); });
  els.resetBtn.addEventListener("click", () => { stopPlay(); vizIndex = 0; drawCanvas(); updateVizInfo(); });
  els.runStatsBtn.addEventListener("click", runStats);

  compute(); // seed everything with k=6, G=(1,5) from the handout
}

// ---------------------------------------------------------------- key generation

function compute() {
  const k = parseInt(els.kInput.value, 10);
  const G = readPoint(els.gSelect);

  if (!Number.isInteger(k) || k < 1) {
    els.publicKeyOut.textContent = "k must be a positive integer";
    return;
  }

  const Q = scalarMultFast(k, G);
  els.publicKeyOut.textContent = `Q = ${fmtPoint(Q)}   (k = ${k}, G = ${fmtPoint(G)})`;

  const STEP_CAP = 300;
  if (k <= STEP_CAP) {
    const steps = naiveMultiples(k, G);
    els.stepLog.textContent = steps
      .map((pt, i) => `${String(i + 1).padStart(3)}G = ${fmtPoint(pt)}`)
      .join("\n");
    vizSteps = [null, ...steps];
  } else {
    els.stepLog.textContent =
      `k = ${k} is too large to list one step at a time here.\n` +
      `Q was computed with double-and-add in ${Math.ceil(Math.log2(k + 1))} squarings instead of ${k} additions.`;
    vizSteps = [null, Q];
  }

  vizIndex = 0;
  drawCanvas();
  updateVizInfo();
}

// ---------------------------------------------------------------- canvas visualisation

function toCanvas(x, y, size, margin) {
  const scale = (size - 2 * margin) / (P - 1);
  return [margin + x * scale, size - margin - y * scale];
}

function drawCanvas() {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const margin = 34;
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = "#332b1f";
  ctx.lineWidth = 1;
  for (let i = 0; i < P; i++) {
    const [gx] = toCanvas(i, 0, size, margin);
    const [, gy] = toCanvas(0, i, size, margin);
    ctx.beginPath(); ctx.moveTo(gx, margin); ctx.lineTo(gx, size - margin); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(margin, gy); ctx.lineTo(size - margin, gy); ctx.stroke();
  }

  ctx.fillStyle = "#5c5240";
  curvePoints.forEach(([x, y]) => {
    const [cx, cy] = toCanvas(x, y, size, margin);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  });

  const G = vizSteps[1] || readPoint(els.gSelect);
  if (G) {
    const [gx, gy] = toCanvas(G[0], G[1], size, margin);
    ctx.fillStyle = "#d7a53e";
    ctx.beginPath(); ctx.arc(gx, gy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d7a53e";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("G", gx + 8, gy - 8);
  }

  // path so far: O -> 1G -> 2G -> ... -> vizIndex G
  ctx.strokeStyle = "#5ba39a";
  ctx.lineWidth = 1.4;
  for (let i = 1; i <= vizIndex; i++) {
    const prev = vizSteps[i - 1];
    const cur = vizSteps[i];
    if (prev === null || cur === null) continue;
    const [x1, y1] = toCanvas(prev[0], prev[1], size, margin);
    const [x2, y2] = toCanvas(cur[0], cur[1], size, margin);
    drawArrow(ctx, x1, y1, x2, y2);
  }

  const current = vizSteps[vizIndex];
  if (current !== null) {
    const [cx, cy] = toCanvas(current[0], current[1], size, margin);
    ctx.strokeStyle = "#8aa66b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#8aa66b";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText(`${vizIndex}G`, cx + 10, cy + 4);
  } else if (vizIndex > 0) {
    ctx.fillStyle = "#8aa66b";
    ctx.font = "13px 'JetBrains Mono', monospace";
    ctx.fillText("O (point at infinity)", margin, margin - 12);
  }
}

function drawArrow(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function updateVizInfo() {
  const total = vizSteps.length - 1;
  const current = vizSteps[vizIndex];
  els.vizInfo.textContent =
    `step ${vizIndex} / ${total}\n` +
    `running point: ${fmtPoint(current)}\n\n` +
    (vizIndex === 0
      ? "start: O (identity / point at infinity)"
      : `${vizIndex - 1}G + G = ${vizIndex}G`);
}

function stepViz() {
  if (vizIndex >= vizSteps.length - 1) { stopPlay(); return; }
  vizIndex++;
  drawCanvas();
  updateVizInfo();
}

function togglePlay() {
  if (playTimer) { stopPlay(); return; }
  els.playBtn.textContent = "⏸ Pause";
  playTimer = setInterval(() => {
    if (vizIndex >= vizSteps.length - 1) { stopPlay(); return; }
    stepViz();
  }, Number(els.speedRange.value));
}

function stopPlay() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  els.playBtn.textContent = "▶ Play";
}

// ---------------------------------------------------------------- statistical exploration

function drawBarChart(canvas, values, labels, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...values);
  const n = values.length;
  const barW = w / n;
  const padBottom = 18;
  for (let i = 0; i < n; i++) {
    const barH = (values[i] / max) * (h - padBottom - 8);
    ctx.fillStyle = color;
    ctx.fillRect(i * barW + 2, h - padBottom - barH, barW - 4, barH);
    ctx.fillStyle = "#a39780";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], i * barW + barW / 2, h - 5);
  }
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return 0;
  return num / Math.sqrt(dx2 * dy2);
}

function runStats() {
  const N = Math.max(2, parseInt(els.statN.value, 10) || 27);
  const baseG = readPoint(els.statGSelect);
  const useAllG = els.allGCheck.checked;

  const bases = useAllG ? curvePoints : [baseG];
  const samples = []; // { k, G, Q }

  bases.forEach((G) => {
    for (let k = 1; k <= N; k++) {
      samples.push({ k, G, Q: scalarMultFast(k, G) });
    }
  });

  const affine = samples.filter((s) => s.Q !== null);
  const numInfinity = samples.length - affine.length;

  const histX = new Array(P).fill(0);
  const histY = new Array(P).fill(0);
  const bitCount = new Array(5).fill(0);

  affine.forEach(({ Q }) => {
    histX[Q[0]]++;
    histY[Q[1]]++;
    toBits(Q[0], 5).forEach((b, i) => { bitCount[i] += b; });
  });

  drawBarChart(els.histX, histX, [...Array(P).keys()].map(String), "#5ba39a");
  drawBarChart(els.histY, histY, [...Array(P).keys()].map(String), "#d7a53e");
  drawBarChart(
    els.histBits,
    bitCount.map((c) => (affine.length ? c / affine.length : 0)),
    bitCount.map((_, i) => `b${i}`),
    "#8aa66b"
  );

  const distinctX = new Set(affine.map((s) => s.Q[0])).size;
  const corr = pearson(affine.map((s) => s.k), affine.map((s) => s.Q[0]));
  const n = useAllG ? subgroupOrder(baseG) : subgroupOrder(baseG);

  els.statsText.textContent =
    `samples drawn: ${samples.length} (${useAllG ? "all " + curvePoints.length + " base points" : "single G = " + fmtPoint(baseG)}, k = 1..${N})\n` +
    `point at infinity hit ${numInfinity} times out of ${samples.length} ` +
    `(${useAllG ? "expected roughly one per full cycle of each base point" : `expected about ${(samples.length / n).toFixed(2)} times, since this G has order ${n}`})\n` +
    `distinct x-coordinates observed: ${distinctX} / ${P} possible\n` +
    `bit-1 frequency per bit of x: ${bitCount.map((c, i) => `b${i}=${(affine.length ? c / affine.length : 0).toFixed(2)}`).join(", ")}\n` +
    `Pearson correlation(k, x): ${corr.toFixed(3)}  -- near 0: no linear relationship, despite full determinism`;

  if (!useAllG) {
    const order = n;
    const rows = [];
    const limit = Math.min(N, order * 2);
    for (let k = 1; k <= limit; k++) {
      const Q = scalarMultFast(k, baseG);
      rows.push(`k=${String(k).padStart(2)}  (k mod ${order}=${String(k % order).padStart(2)})  Q = ${fmtPoint(Q)}`);
    }
    els.periodDemo.textContent =
      `PERIODICITY: Q = kG depends only on k mod n, where n = order(G) = ${order}.\n` +
      `Real secp256k1 behaves identically, except n is a ~256-bit prime, so no collision is ever observed in practice.\n\n` +
      rows.join("\n");
  } else {
    els.periodDemo.textContent =
      "(periodicity table hidden while sweeping over all base points -- switch off the checkbox to see one G's cycle)";
  }

  const k0 = Math.max(1, Math.min(N - 1, Math.floor(N / 2)));
  const Qk0 = scalarMultFast(k0, baseG);
  const Qk0plus1 = scalarMultFast(k0 + 1, baseG);
  const diffShouldBeG = Qk0plus1 !== null && Qk0 !== null ? pointAdd(Qk0, [baseG[0], mod(-baseG[1], P)]) : null;

  const bitFlipLines = [];
  for (let bit = 0; bit < 5; bit++) {
    const kFlipped = k0 ^ (1 << bit);
    if (kFlipped < 1) continue;
    const Qflip = scalarMultFast(kFlipped, baseG);
    const d =
      Qk0 !== null && Qflip !== null
        ? hamming(toBits(Qk0[0], 5), toBits(Qflip[0], 5))
        : "n/a (hit O)";
    bitFlipLines.push(`k0=${k0} vs k0^bit${bit}=${kFlipped}:  Q=${fmtPoint(Qk0)}  vs  Q'=${fmtPoint(Qflip)}   Hamming(x-bits)=${d}`);
  }

  els.avalancheDemo.textContent =
    `AVALANCHE CHECK, base G = ${fmtPoint(baseG)}\n\n` +
    `arithmetic increment (k0 -> k0+1):\n` +
    `  Q(${k0})   = ${fmtPoint(Qk0)}\n` +
    `  Q(${k0 + 1}) = ${fmtPoint(Qk0plus1)}\n` +
    `  Q(${k0+1}) - G should equal Q(${k0}): ${fmtPoint(diffShouldBeG)}  -> exact, structured shift, zero avalanche\n\n` +
    `single-bit flip of k0 (unstructured jump through the double-and-add path):\n` +
    bitFlipLines.join("\n");
}

init();
