"use strict";

// Page wiring for HMWK3: runs the simulation from sim.js and draws everything.
// Charts are plain canvas, with a small helper class for scales, axes and hover.

const $ = (id) => document.getElementById(id);
const CHECKPOINTS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const DIST_N = [10, 100, 1000, 10000];
const SEEDS = { bernoulli: 11, rademacher: 22, hit: 33 };
const N_PATHS = 40;

const state = {
  p: 0.3, m: 2000, runs: null,
  pathModel: "bernoulli", pathQty: "S", pathRange: 10000,
  distModel: "bernoulli", eps: 0.05, cltN: 100,
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));
const ci = (n) => CHECKPOINTS.indexOf(n);

function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return "–";
  if (v === 0) return "0";
  if (Number.isInteger(v) && Math.abs(v) < 1e5) return String(v);
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  return v.toFixed(digits);
}

// ---------------------------------------------------------------- tooltip

const tip = $("tooltip");
function showTip(text, pageX, pageY) {
  tip.textContent = text;
  tip.style.display = "block";
  const w = tip.offsetWidth;
  const left = pageX + 14 + w > window.scrollX + document.documentElement.clientWidth ? pageX - w - 14 : pageX + 14;
  tip.style.left = left + "px";
  tip.style.top = pageY + 14 + "px";
}
function hideTip() { tip.style.display = "none"; }

// ---------------------------------------------------------------- plot helper

class Plot {
  constructor(container, height) {
    this.container = container;
    this.height = height;
    this.canvas = document.createElement("canvas");
    container.innerHTML = "";
    container.appendChild(this.canvas);
    this.hover = null;
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.hover) return;
      const r = this.canvas.getBoundingClientRect();
      const text = this.hover(e.clientX - r.left, e.clientY - r.top);
      if (text) showTip(text, e.pageX, e.pageY); else hideTip();
    });
    this.canvas.addEventListener("mouseleave", hideTip);
  }

  // x/y: {min, max, log}
  begin(x, y, pad = { l: 46, r: 22, t: 10, b: 30 }) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 300;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.height = this.height + "px";
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, this.height);
    Object.assign(this, { ctx, w, h: this.height, x, y, pad });
    return this;
  }

  t(v, ax) { return ax.log ? Math.log10(v) : v; }
  X(v) {
    const { x, pad, w } = this;
    return pad.l + ((this.t(v, x) - this.t(x.min, x)) / (this.t(x.max, x) - this.t(x.min, x))) * (w - pad.l - pad.r);
  }
  Y(v) {
    const { y, pad, h } = this;
    return h - pad.b - ((this.t(v, y) - this.t(y.min, y)) / (this.t(y.max, y) - this.t(y.min, y))) * (h - pad.t - pad.b);
  }
  invX(px) {
    const { x, pad, w } = this;
    const t = this.t(x.min, x) + ((px - pad.l) / (w - pad.l - pad.r)) * (this.t(x.max, x) - this.t(x.min, x));
    return x.log ? Math.pow(10, t) : t;
  }

  axes(xTicks, yTicks, xFmt = String, yFmt = String, xLabel = "") {
    const { ctx, pad, w, h } = this;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.lineWidth = 1;
    ctx.strokeStyle = css("--border");
    ctx.fillStyle = css("--muted");
    ctx.textAlign = "right";
    for (const v of yTicks) {
      const py = Math.round(this.Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
      ctx.fillText(yFmt(v), pad.l - 5, py + 3);
    }
    ctx.textAlign = "center";
    for (const v of xTicks) ctx.fillText(xFmt(v), this.X(v), h - pad.b + 13);
    if (xLabel) ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 3);
  }

  clip(fn) {
    const { ctx, pad, w, h } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
    ctx.clip();
    fn(ctx);
    ctx.restore();
  }

  line(pts, color, width = 2, dash = null, alpha = 1) {
    this.clip((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(this.X(a), this.Y(b)) : ctx.moveTo(this.X(a), this.Y(b))));
      ctx.stroke();
    });
  }

  band(xs, lo, hi, color, alpha = 0.16) {
    this.clip((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      xs.forEach((x, i) => (i ? ctx.lineTo(this.X(x), this.Y(hi[i])) : ctx.moveTo(this.X(x), this.Y(hi[i]))));
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.X(xs[i]), this.Y(lo[i]));
      ctx.closePath();
      ctx.fill();
    });
  }

  dots(pts, color, r = 4) {
    this.clip((ctx) => {
      for (const [a, b] of pts) {
        ctx.fillStyle = css("--panel");
        ctx.beginPath(); ctx.arc(this.X(a), this.Y(b), r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(this.X(a), this.Y(b), r, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // bars: [{x0, x1, y}] anchored at y = 0, 2px gap between neighbours, rounded tops
  bars(list, color) {
    this.clip((ctx) => {
      ctx.fillStyle = color;
      for (const b of list) {
        if (b.y <= 0) continue;
        const x0 = this.X(b.x0) + 1, x1 = this.X(b.x1) - 1;
        const y0 = this.Y(0), y1 = this.Y(b.y);
        const wd = Math.max(1, x1 - x0), r = Math.min(4, wd / 2, (y0 - y1) / 2);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1 + r);
        ctx.quadraticCurveTo(x0, y1, x0 + r, y1);
        ctx.lineTo(x0 + wd - r, y1);
        ctx.quadraticCurveTo(x0 + wd, y1, x0 + wd, y1 + r);
        ctx.lineTo(x0 + wd, y0);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
}

function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9 * span; v += step) out.push(+v.toFixed(10));
  return out;
}

function logTicks(min, max) {
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  return out;
}

const pow10Fmt = (v) => {
  const e = Math.round(Math.log10(v));
  return e >= 0 && e <= 4 ? String(Math.pow(10, e)) : "1e" + e;
};

function legend(el, items) {
  el.innerHTML = items
    .map(([label, color, kind]) => `<span style="--c:${color}" class="${kind || ""}">${label}</span>`)
    .join("");
}

// ---------------------------------------------------------------- simulation

async function runAll() {
  const p = Math.min(0.99, Math.max(0.01, parseFloat($("pInput").value) || 0.3));
  $("pInput").value = p;
  const m = parseInt($("mInput").value, 10);
  Object.assign(state, { p, m });
  $("runBtn").disabled = true;
  const t0 = performance.now();
  const runs = {};
  for (const model of ["bernoulli", "rademacher"]) {
    $("runStatus").textContent = `simulating ${model} (${m} attackers × 10,000 systems)…`;
    await yieldToBrowser();
    runs[model] = Sim.simulate({ model, p, m, checkpoints: CHECKPOINTS, seed: SEEDS[model], paths: N_PATHS, pathPoints: 10000 });
  }
  $("runStatus").textContent = "small runs for section 07…";
  await yieldToBrowser();
  runs.hit = [1, 2, 3, 5, 10, 20].map((mm) => {
    const r = Sim.simulate({ model: "bernoulli", p, m: mm, checkpoints: [1000], seed: SEEDS.hit });
    let hit = 0;
    for (const h of r.hitBy) if (h > 0) hit++;
    return { m: mm, share: hit / 1000 };
  });
  state.runs = runs;
  $("runStatus").textContent =
    `done: ${(2 * m * 10000).toLocaleString("en-US")} simulated steps in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  $("runBtn").disabled = false;
  drawAll();
}

function drawAll() {
  if (!state.runs) return;
  drawPaths();
  drawDists();
  drawLLN();
  drawVariance();
  drawCLT();
  drawInterpretation();
}

// ---------------------------------------------------------------- 02 trajectories

let pathPlot;
function drawPaths() {
  const run = state.runs[state.pathModel];
  const { mu, sigma2 } = Sim.moments(state.pathModel, state.p);
  const K = state.pathRange;
  const step = Math.max(1, Math.floor(K / 600));
  const ks = [];
  for (let k = 1; k <= K; k += step) ks.push(k);
  if (ks[ks.length - 1] !== K) ks.push(K);

  // value of quantity q for S at step k, and its theoretical mean / sd
  const scale = { S: () => 1, avg: (k) => 1 / k, norm: (k) => 1 / Math.sqrt(k) }[state.pathQty];
  const meanAt = (k) => k * mu * scale(k);
  const sdAt = (k) => Math.sqrt(k * sigma2) * scale(k);

  const paths = run.pathS.map((arr) => ks.map((k) => [k, arr[k - 1] * scale(k)]));
  const lo = ks.map((k) => meanAt(k) - 2 * sdAt(k));
  const hi = ks.map((k) => meanAt(k) + 2 * sdAt(k));

  let yMin = Infinity, yMax = -Infinity;
  for (const p of paths) for (const [, v] of p) { yMin = Math.min(yMin, v); yMax = Math.max(yMax, v); }
  const tailIdx = Math.floor(ks.length * 0.1); // ignore the wild first 10% when fitting the band in
  for (let i = tailIdx; i < ks.length; i++) { yMin = Math.min(yMin, lo[i]); yMax = Math.max(yMax, hi[i]); }
  if (state.pathQty === "avg") { yMin = Math.max(yMin, state.pathModel === "bernoulli" ? 0 : -1); yMax = Math.min(yMax, 1); }
  if (state.pathModel === "rademacher") { const a = Math.max(-yMin, yMax); yMin = -a; yMax = a; }
  const padY = (yMax - yMin) * 0.05 || 1;
  yMin -= padY; yMax += padY;

  pathPlot = pathPlot || new Plot($("pathChart"), 320);
  const pl = pathPlot.begin({ min: 1, max: K }, { min: yMin, max: yMax });
  pl.axes(niceTicks(0, K, 5).filter((v) => v >= 1), niceTicks(yMin, yMax, 6), String, (v) => fmt(v, 2), "k = systems visited");
  pl.band(ks, lo, hi, css("--s2"));
  for (const p of paths) pl.line(p, css("--muted"), 1, null, 0.45);
  pl.line(ks.map((k) => [k, meanAt(k)]), css("--s1"), 2);

  const qtyName = { S: "S_k", avg: "S_k/k", norm: "S_k/√k" }[state.pathQty];
  pl.hover = (px) => {
    const k = Math.round(pl.invX(px));
    if (k < 1 || k > K) return null;
    const vals = run.pathS.map((arr) => arr[k - 1] * scale(k));
    return `k = ${k}\nmean ${qtyName} (theory)  ${fmt(meanAt(k))}\nmean ± 2 sd            [${fmt(meanAt(k) - 2 * sdAt(k))}, ${fmt(meanAt(k) + 2 * sdAt(k))}]\n` +
      `${N_PATHS} attackers: min ${fmt(Math.min(...vals))}, max ${fmt(Math.max(...vals))}`;
  };
  legend($("pathLegend"), [
    [`${N_PATHS} attackers`, css("--muted")],
    ["theoretical mean", css("--s1")],
    ["mean ± 2 sd", css("--s2")],
  ]);
}

// ---------------------------------------------------------------- 03 distributions

const distPlots = { S: [], avg: [], norm: [] };

// histogram of a quantity c * S, with bins that are whole multiples of the lattice spacing of S
function latticeHist(S, factor, lattice, lo, hi, maxBins = 40) {
  const spanS = (hi - lo) / factor;
  const binS = lattice * Math.max(1, Math.ceil(spanS / lattice / maxBins));
  // align the bin edges so that lattice points sit in the middle of a bin; S[0] is one
  // lattice point (for Rademacher with odd n the lattice is the odd numbers, not the even)
  const origin = S[0];
  const startS = origin + Math.floor((lo / factor - origin) / binS) * binS - binS / 2;
  const nb = Math.ceil((hi / factor - startS) / binS) + 1;
  const counts = new Array(nb).fill(0);
  for (let i = 0; i < S.length; i++) {
    const b = Math.floor((S[i] - startS) / binS);
    if (b >= 0 && b < nb) counts[b]++;
  }
  const w = binS * factor;
  return counts.map((c, i) => ({
    x0: (startS + i * binS) * factor,
    x1: (startS + (i + 1) * binS) * factor,
    y: c / (S.length * w), // density, so the normal curve can be drawn on the same scale
    count: c,
  }));
}

function drawDists() {
  const model = state.distModel;
  const run = state.runs[model];
  const { mu, sigma2 } = Sim.moments(model, state.p);
  const lattice = model === "bernoulli" ? 1 : 2;
  const quantities = [
    { key: "S", row: "distRowS", factor: () => 1, label: "S_n" },
    { key: "avg", row: "distRowAvg", factor: (n) => 1 / n, label: "S_n/n" },
    { key: "norm", row: "distRowNorm", factor: (n) => 1 / Math.sqrt(n), label: "S_n/√n" },
  ];

  for (const q of quantities) {
    const rowEl = $(q.row);
    if (distPlots[q.key].length === 0) {
      rowEl.innerHTML = DIST_N.map((n) => `<div><div class="chart"></div><div class="status" style="text-align:center">n = ${n}</div></div>`).join("");
      distPlots[q.key] = [...rowEl.querySelectorAll(".chart")].map((el) => new Plot(el, 150));
    }

    // common x range for the scaled rows, own range for S_n
    let common = null;
    if (q.key === "avg") common = model === "bernoulli" ? [0, 1] : [-1, 1];
    if (q.key === "norm") {
      let a = Infinity, b = -Infinity;
      for (const n of DIST_N) for (const s of run.S[ci(n)]) { const v = s * q.factor(n); a = Math.min(a, v); b = Math.max(b, v); }
      common = model === "rademacher" ? [-Math.max(-a, b), Math.max(-a, b)] : [a, b];
    }

    DIST_N.forEach((n, i) => {
      const S = run.S[ci(n)];
      const f = q.factor(n);
      let lo, hi;
      if (common) [lo, hi] = common;
      else {
        lo = Infinity; hi = -Infinity;
        for (const s of S) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
        if (model === "rademacher") { const a = Math.max(-lo, hi); lo = -a; hi = a; }
      }
      const padX = (hi - lo) * 0.06 || lattice;
      lo -= padX; hi += padX;
      const bins = latticeHist(S, f, lattice, lo, hi);
      const m0 = n * mu * f, sd = Math.sqrt(n * sigma2) * f;
      const curve = [];
      for (let t = 0; t <= 120; t++) {
        const x = lo + ((hi - lo) * t) / 120;
        curve.push([x, Sim.normalPdf((x - m0) / sd) / sd]);
      }
      const yMax = Math.max(...bins.map((b) => b.y), ...curve.map((c) => c[1])) * 1.08;
      const pl = distPlots[q.key][i].begin({ min: lo, max: hi }, { min: 0, max: yMax }, { l: 8, r: 8, t: 6, b: 22 });
      pl.axes(niceTicks(lo, hi, 3), [0], (v) => fmt(v, 2), () => "");
      pl.bars(bins, css("--s2"));
      pl.line(curve, css("--s1"), 2);
      pl.hover = (px) => {
        const x = pl.invX(px);
        const b = bins.find((bb) => x >= bb.x0 && x < bb.x1);
        if (!b) return null;
        return `n = ${n}, ${q.label} in [${fmt(b.x0)}, ${fmt(b.x1)})\n${b.count} of ${S.length} attackers`;
      };
    });
  }

  let html = `<table class="defs num-table"><thead><tr><th>n</th>` +
    `<th>mean S<sub>n</sub></th><th>var S<sub>n</sub></th>` +
    `<th>mean S<sub>n</sub>/n</th><th>var S<sub>n</sub>/n</th>` +
    `<th>mean S<sub>n</sub>/&radic;n</th><th>var S<sub>n</sub>/&radic;n</th></tr></thead><tbody>`;
  for (const n of DIST_N) {
    const S = run.S[ci(n)];
    const cell = (sim, th) => `<td>${fmt(sim)}<br><span class="hint">${fmt(th)}</span></td>`;
    html += `<tr><td>${n}</td>` +
      cell(Sim.mean(S), n * mu) + cell(Sim.variance(S), n * sigma2) +
      cell(Sim.mean(S) / n, mu) + cell(Sim.variance(S) / (n * n), sigma2 / n) +
      cell(Sim.mean(S) / Math.sqrt(n), Math.sqrt(n) * mu) + cell(Sim.variance(S) / n, sigma2) + `</tr>`;
  }
  html += `</tbody></table><p class="hint">top: simulation (${state.m} attackers), bottom: theory.</p>`;
  $("distTable").innerHTML = html;
}

// ---------------------------------------------------------------- 04 LLN

const llnPlots = {};
function llnData(model) {
  const run = state.runs[model];
  const { mu, sigma2 } = Sim.moments(model, state.p);
  return CHECKPOINTS.map((n, c) => ({
    n,
    sim: Sim.tailFraction(run.S[c], n, mu, state.eps),
    exact: Sim.exactTail(model, state.p, n, state.eps),
    cheb: Math.min(1, sigma2 / (n * state.eps * state.eps)),
  }));
}

function drawLLN() {
  const data = {};
  for (const [model, el] of [["bernoulli", "llnChartB"], ["rademacher", "llnChartR"]]) {
    const d = (data[model] = llnData(model));
    llnPlots[model] = llnPlots[model] || new Plot($(el), 240);
    const pl = llnPlots[model].begin({ min: 1, max: 10000, log: true }, { min: 0, max: 1.05 });
    pl.axes(logTicks(1, 10000), [0, 0.25, 0.5, 0.75, 1], pow10Fmt, (v) => v.toFixed(2), "n (log scale)");
    pl.line(d.map((r) => [r.n, r.cheb]), css("--s3"), 2, [5, 4]);
    pl.line(d.map((r) => [r.n, r.exact]), css("--s2"), 2);
    pl.dots(d.map((r) => [r.n, r.sim]), css("--s1"), 4);
    pl.hover = (px) => {
      const x = pl.invX(px);
      const r = d.reduce((a, b) => (Math.abs(Math.log(b.n / x)) < Math.abs(Math.log(a.n / x)) ? b : a));
      return `n = ${r.n}, ε = ${state.eps}\nsimulated  ${fmt(r.sim, 4)}\nexact      ${fmt(r.exact, 4)}\nChebyshev  ${fmt(r.cheb, 4)}`;
    };
  }
  legend($("llnLegend"), [
    [`simulated (${state.m} attackers)`, css("--s1")],
    ["exact (binomial)", css("--s2")],
    ["Chebyshev bound σ²/(nε²)", css("--s3")],
  ]);

  let html = `<table class="defs num-table"><thead><tr><th rowspan="2">n</th>` +
    `<th colspan="3">Bernoulli, p = ${state.p}</th><th colspan="3">Rademacher</th></tr>` +
    `<tr><th>simulated</th><th>exact</th><th>Chebyshev</th><th>simulated</th><th>exact</th><th>Chebyshev</th></tr></thead><tbody>`;
  CHECKPOINTS.forEach((n, i) => {
    const b = data.bernoulli[i], r = data.rademacher[i];
    html += `<tr><td>${n}</td><td>${b.sim.toFixed(4)}</td><td>${b.exact.toFixed(4)}</td><td>${b.cheb.toFixed(4)}</td>` +
      `<td>${r.sim.toFixed(4)}</td><td>${r.exact.toFixed(4)}</td><td>${r.cheb.toFixed(4)}</td></tr>`;
  });
  html += `</tbody></table><p class="hint">P(|S<sub>n</sub>/n &minus; &mu;| &gt; ${state.eps}); Chebyshev capped at 1.</p>`;
  $("llnTable").innerHTML = html;
}

// ---------------------------------------------------------------- 05 variance

const varPlots = {};
function drawVariance() {
  const series = [
    { key: "S", label: "S_n", color: css("--s1"), pow: 0 },
    { key: "norm", label: "S_n/√n", color: css("--s2"), pow: 1 },
    { key: "avg", label: "S_n/n", color: css("--s3"), pow: 2 },
  ];
  const slopeLines = [];
  for (const [model, el] of [["bernoulli", "varChartB"], ["rademacher", "varChartR"]]) {
    const run = state.runs[model];
    const { sigma2 } = Sim.moments(model, state.p);
    // Var(S_n / n^(pow/2)) = Var(S_n) / n^pow
    const pts = series.map((s) => ({
      ...s,
      sim: CHECKPOINTS.map((n, c) => [n, Sim.variance(run.S[c]) / Math.pow(n, s.pow)]),
      th: CHECKPOINTS.map((n) => [n, (n * sigma2) / Math.pow(n, s.pow)]),
    }));
    const all = pts.flatMap((s) => [...s.sim, ...s.th].map((q) => q[1])).filter((v) => v > 0);
    const yMin = Math.pow(10, Math.floor(Math.log10(Math.min(...all))));
    const yMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
    varPlots[model] = varPlots[model] || new Plot($(el), 260);
    const pl = varPlots[model].begin({ min: 1, max: 10000, log: true }, { min: yMin, max: yMax, log: true });
    pl.axes(logTicks(1, 10000), logTicks(yMin, yMax), pow10Fmt, pow10Fmt, "n (log scale)");
    for (const s of pts) pl.line(s.th, s.color, 2, [5, 4]);
    for (const s of pts) pl.dots(s.sim, s.color, 4);
    pl.hover = (px) => {
      const x = pl.invX(px);
      const i = CHECKPOINTS.reduce((a, n, j) => (Math.abs(Math.log(n / x)) < Math.abs(Math.log(CHECKPOINTS[a] / x)) ? j : a), 0);
      return `n = ${CHECKPOINTS[i]}\n` + pts.map((s) => `Var ${s.label.padEnd(7)} ${fmt(s.sim[i][1], 4).padStart(9)}  (theory ${fmt(s.th[i][1], 4)})`).join("\n");
    };
    slopeLines.push(
      `${model.padEnd(10)}  ` +
      pts.map((s) => `slope of Var ${s.label}: ${Sim.logLogSlope(CHECKPOINTS, s.sim.map((q) => q[1])).toFixed(3)} (theory ${1 - s.pow})`).join("   ")
    );
  }
  legend($("varLegend"), series.map((s) => [`Var ${s.label}`, s.color]).concat([["dashed = theory", css("--muted")]]));
  $("varSlopes").textContent = "least-squares slopes of log Var against log n, simulated points:\n" + slopeLines.join("\n");
}

// ---------------------------------------------------------------- 06 CLT

const cltPlots = {};
function standardised(model, n) {
  const { mu, sigma2 } = Sim.moments(model, state.p);
  const S = state.runs[model].S[ci(n)];
  return { z: Float64Array.from(S, (s) => (s - n * mu) / Math.sqrt(n * sigma2)), S, factor: 1 / Math.sqrt(n * sigma2), shift: n * mu };
}

function drawCLT() {
  const n = state.cltN;
  for (const [model, el] of [["rademacher", "cltChartR"], ["bernoulli", "cltChartB"]]) {
    const { z, S, factor, shift } = standardised(model, n);
    // histogram of z = (S - shift) * factor; lattice spacing of S is 2 (Rademacher) or 1 (Bernoulli)
    const lattice = model === "bernoulli" ? 1 : 2;
    const shifted = Float64Array.from(S, (s) => s - shift);
    const bins = latticeHist(shifted, factor, lattice, -4, 4, 40);
    const curve = [];
    for (let t = 0; t <= 160; t++) { const x = -4 + (8 * t) / 160; curve.push([x, Sim.normalPdf(x)]); }
    const yMax = Math.max(0.45, ...bins.map((b) => b.y)) * 1.05;
    cltPlots[model] = cltPlots[model] || new Plot($(el), 230);
    const pl = cltPlots[model].begin({ min: -4, max: 4 }, { min: 0, max: yMax });
    pl.axes([-4, -3, -2, -1, 0, 1, 2, 3, 4], niceTicks(0, yMax, 4), String, (v) => v.toFixed(2));
    pl.bars(bins, css("--s2"));
    pl.line(curve, css("--s1"), 2);
    const ks = Sim.ksNormal(z);
    pl.hover = (px) => {
      const x = pl.invX(px);
      const b = bins.find((bb) => x >= bb.x0 && x < bb.x1);
      const head = `n = ${n}, KS distance D = ${ks.toFixed(4)}`;
      if (!b) return head;
      return `${head}\nz in [${fmt(b.x0)}, ${fmt(b.x1)}): ${b.count} attackers\nhistogram density ${b.y.toFixed(3)}, N(0,1) density at centre ${Sim.normalPdf((b.x0 + b.x1) / 2).toFixed(3)}`;
    };
  }

  const floor = 0.87 / Math.sqrt(state.m);
  let html = `<table class="defs num-table"><thead><tr><th>n</th><th>D, Rademacher S<sub>n</sub>/&radic;n</th>` +
    `<th>D, Bernoulli standardised</th><th>half lattice step, Rademacher / Bernoulli</th><th>Monte Carlo floor 0.87/&radic;m</th></tr></thead><tbody>`;
  for (const nn of CHECKPOINTS) {
    const dR = Sim.ksNormal(standardised("rademacher", nn).z);
    const dB = Sim.ksNormal(standardised("bernoulli", nn).z);
    html += `<tr${nn === n ? ' style="outline:1px solid var(--brass)"' : ""}><td>${nn}</td><td>${dR.toFixed(4)}</td><td>${dB.toFixed(4)}</td>` +
      `<td>${(0.4 / Math.sqrt(nn)).toFixed(4)} / ${(0.2 / Math.sqrt(nn * state.p * (1 - state.p))).toFixed(4)}</td><td>${floor.toFixed(4)}</td></tr>`;
  }
  html += `</tbody></table><p class="hint">The half-step column is the gap a lattice distribution leaves even when it is as close to &Phi; as it can be: about half of the largest jump of the CDF, 0.4/&radic;n for Rademacher (spacing 2) and 0.2/&radic;(np(1&minus;p)) for Bernoulli (spacing 1). It is an order of magnitude, not an exact bound.</p>`;
  $("cltTable").innerHTML = html;
}

// ---------------------------------------------------------------- 07 interpretation

function drawInterpretation() {
  const run = state.runs.bernoulli;
  const subsets = [1, 10, 100, 1000, state.m].filter((v, i, a) => v <= state.m && a.indexOf(v) === i);
  let html = `<table class="defs num-table"><thead><tr><th>n</th>` +
    subsets.map((mm) => `<th>best of ${mm}</th>`).join("") + `</tr></thead><tbody>`;
  for (const n of DIST_N) {
    const S = run.S[ci(n)];
    html += `<tr><td>${n}</td>` + subsets.map((mm) => `<td>${(Sim.maxOf(S, mm) / n).toFixed(3)}</td>`).join("") + `</tr>`;
  }
  html += `</tbody></table><p class="hint">highest success rate S<sub>n</sub>/n among the first m&prime; Bernoulli attackers (p = ${state.p}).</p>`;
  $("bestTable").innerHTML = html;

  let h2 = `<table class="defs num-table"><thead><tr><th>attackers m</th><th>simulated</th><th>1 &minus; (1&minus;p)<sup>m</sup></th></tr></thead><tbody>`;
  for (const r of state.runs.hit) h2 += `<tr><td>${r.m}</td><td>${r.share.toFixed(3)}</td><td>${(1 - Math.pow(1 - state.p, r.m)).toFixed(3)}</td></tr>`;
  h2 += `</tbody></table><p class="hint">share of n = 1000 systems penetrated by at least one of m independent attackers.</p>`;
  $("hitTable").innerHTML = h2;
}

// ---------------------------------------------------------------- controls

function segmented(id, onPick) {
  const el = $(id);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onPick(b.dataset.v);
  });
}

segmented("pathModel", (v) => { state.pathModel = v; drawPaths(); });
segmented("pathQty", (v) => { state.pathQty = v; drawPaths(); });
segmented("pathRange", (v) => { state.pathRange = +v; drawPaths(); });
segmented("distModel", (v) => { state.distModel = v; drawDists(); });
segmented("epsSel", (v) => { state.eps = +v; drawLLN(); });
segmented("cltN", (v) => { state.cltN = +v; drawCLT(); });
$("runBtn").addEventListener("click", runAll);

let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawAll, 150); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawAll);

runAll();
