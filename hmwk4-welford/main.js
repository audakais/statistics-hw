"use strict";

// Page wiring for HMWK4. The formulas and the experiment are in welford.js.

const SIZES = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];
const HIST_N = [5, 20, 100, 1000];
// t quantiles at 0.975 with n - 1 degrees of freedom
const T975 = { 2: 12.706, 5: 2.776, 10: 2.262, 20: 2.093, 50: 2.010, 100: 1.984, 200: 1.972, 500: 1.965, 1000: 1.962, 5000: 1.960 };
const RUN_N = 2000;
const RUN_COUNT = 5;

const state = { pmf: null, mom: null, rows: null, paths: null, runQty: "M" };
const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- Ex. 1

function runTrace() {
  const xs = $("traceInput").value.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (xs.length === 0 || xs.some((x) => !Number.isFinite(x))) {
    $("traceOut").innerHTML = `<p class="hint">Enter a list of numbers.</p>`;
    return;
  }
  const st = Welford.newStats();
  let html = `<table class="defs num-table"><thead><tr><th>k</th><th>x<sub>k</sub></th>` +
    `<th>x<sub>k</sub> &minus; M<sub>k&minus;1</sub></th><th>M<sub>k</sub></th><th>SS<sub>k</sub></th>` +
    `<th>s<sub>k</sub>&sup2;</th><th>SS from scratch</th></tr></thead><tbody>`;
  xs.forEach((x, i) => {
    const d = x - st.M;
    Welford.push(st, x);
    html += `<tr><td>${st.k}</td><td>${x}</td><td>${d.toFixed(4)}</td><td>${st.M.toFixed(4)}</td>` +
      `<td>${st.SS.toFixed(4)}</td><td>${st.k > 1 ? Welford.sampleVariance(st).toFixed(4) : "–"}</td>` +
      `<td>${Welford.batchSS(xs.slice(0, i + 1)).toFixed(4)}</td></tr>`;
  });
  $("traceOut").innerHTML = html + `</tbody></table><p class="hint">The last column recomputes SS directly from its definition at every step, as a check.</p>`;
}

function stabilityTable() {
  const rand = Welford.rng(7);
  const base = Array.from({ length: 10000 }, () => Math.floor(rand() * 11));
  const rows = [[0, "0"], [1e6, "10^6"], [1e7, "10^7"], [1e8, "10^8"], [1e9, "10^9"], [1e12, "10^12"]];
  let html = `<table class="defs num-table"><thead><tr><th>offset</th><th>exact SS</th>` +
    `<th>&Sigma;x&sup2; &minus; (&Sigma;x)&sup2;/n</th><th>Welford</th><th>two-pass</th></tr></thead><tbody>`;
  for (const [off, label] of rows) {
    const xs = base.map((x) => x + off);
    const exact = Welford.exactSS(xs);
    const st = Welford.newStats();
    xs.forEach((x) => Welford.push(st, x));
    const err = (v) => (Math.abs(v - exact) / exact).toExponential(1);
    html += `<tr><td>${label}</td><td>${exact.toFixed(2)}</td><td>${err(Welford.naiveSS(xs))}</td><td>${err(st.SS)}</td><td>${err(Welford.batchSS(xs))}</td></tr>`;
  }
  $("stabilityTable").innerHTML = html + `</tbody></table>`;
}

// ---------------------------------------------------------------- Ex. 2

let pmfPlot;
function drawPmf() {
  const { pmf, mom } = state;
  pmfPlot = pmfPlot || new Plot($("pmfChart"), 190);
  const yMax = Math.max(...pmf) * 1.1;
  const pl = pmfPlot.begin({ min: -0.5, max: 10.5 }, { min: 0, max: yMax });
  pl.axes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], niceTicks(0, yMax, 4), String, (v) => v.toFixed(2));
  pl.bars(pmf.map((y, x) => ({ x0: x - 0.5, x1: x + 0.5, y })), css("--s2"));
  pl.hover = (px) => {
    const x = Math.round(pl.invX(px));
    return x >= 0 && x <= 10 ? `score ${x}: P = ${pmf[x].toFixed(4)}` : null;
  };
  $("momOut").textContent =
    `exact values from the probabilities\n\n` +
    `μ   = ${mom.mu.toFixed(4)}\n` +
    `σ²  = ${mom.sigma2.toFixed(4)}\n` +
    `σ   = ${Math.sqrt(mom.sigma2).toFixed(4)}\n` +
    `μ₃  = ${mom.mu3.toFixed(4)}   skewness ${mom.skewness.toFixed(3)}\n` +
    `μ₄  = ${mom.mu4.toFixed(4)}   kurtosis ${mom.kurtosis.toFixed(3)}`;
}

function zCell(z) {
  return `<td class="${Math.abs(z) > 3 ? "bad" : ""}">${z.toFixed(2)}</td>`;
}

function drawResults() {
  const { mom, rows } = state;
  let html = `<table class="defs num-table"><thead><tr><th>n</th>` +
    `<th>avg M<sub>n</sub></th><th>z</th><th>avg s<sub>n</sub>&sup2;</th><th>z</th><th>avg SS/n</th><th>avg s<sub>n</sub></th>` +
    `<th>cov(M, s&sup2;)</th><th>95% CI coverage</th></tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr><td>${r.n}</td><td>${r.avgMean.toFixed(4)}</td>${zCell(r.zMean)}` +
      `<td>${r.avgVar.toFixed(4)}</td>${zCell(r.zVar)}<td>${r.avgBiased.toFixed(4)}</td>` +
      `<td>${r.avgSd.toFixed(4)}</td><td>${r.cov.toFixed(4)}</td><td>${r.coverage.toFixed(3)}</td></tr>`;
  }
  html += `</tbody></table><p class="hint">Theory: &mu; = ${mom.mu.toFixed(4)}, &sigma;&sup2; = ${mom.sigma2.toFixed(4)}, ` +
    `&sigma; = ${Math.sqrt(mom.sigma2).toFixed(4)}. Random numbers seeded with 1000 + n.</p>`;
  $("resultTable").innerHTML = html;
}

const sdPlots = {};
function drawSpread() {
  const { rows } = state;
  const spec = [
    ["mean", "sdMeanChart", (r) => Math.sqrt(r.varMean), (r) => Math.sqrt(r.th.varMean), "sd(M_n)"],
    ["var", "sdVarChart", (r) => Math.sqrt(r.varS2), (r) => Math.sqrt(r.th.varS2), "sd(s²_n)"],
  ];
  const slopes = [];
  for (const [key, el, simF, thF, name] of spec) {
    const sim = rows.map((r) => [r.n, simF(r)]), th = rows.map((r) => [r.n, thF(r)]);
    const all = [...sim, ...th].map((q) => q[1]);
    const yMin = Math.pow(10, Math.floor(Math.log10(Math.min(...all))));
    const yMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
    sdPlots[key] = sdPlots[key] || new Plot($(el), 230);
    const pl = sdPlots[key].begin({ min: 1, max: 10000, log: true }, { min: yMin, max: yMax, log: true });
    const yFmt = (v) => (v >= 1 ? String(v) : String(+v.toFixed(4)));
    pl.axes(logTicks(1, 10000), logTicks(yMin, yMax), pow10Fmt, yFmt, "n (log scale)");
    pl.line(th, css("--s1"), 2, [5, 4]);
    pl.dots(sim, css("--s2"), 4);
    pl.hover = (px) => {
      const x = pl.invX(px);
      const r = rows.reduce((a, b) => (Math.abs(Math.log(b.n / x)) < Math.abs(Math.log(a.n / x)) ? b : a));
      return `n = ${r.n}\n${name} simulated ${fmt(simF(r), 4)}\ntheory ${fmt(thF(r), 4)}`;
    };
    const big = rows.filter((r) => r.n >= 10);
    slopes.push(`slope of ${name} against n, log-log: ${Welford.logLogSlope(big.map((r) => r.n), big.map(simF)).toFixed(3)}   (theory -0.5 for large n)`);
  }
  legend($("sdLegend"), [["simulation", css("--s2")], ["theory", css("--s1")]]);
  $("slopeOut").textContent = slopes.join("\n");
}

const histPlots = { means: [], vars: [] };
// w: bin width. The means live on multiples of 1/n, so their bins are whole multiples of it.
function hist(values, lo, hi, w) {
  const bins = Math.ceil((hi - lo) / w);
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const b = Math.floor((v - lo) / w);
    if (b >= 0 && b < bins) counts[b]++;
  }
  return counts.map((c, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, y: c / (values.length * w), count: c }));
}

function drawHistograms() {
  const { mom, rows } = state;
  const sdMax = {
    means: Math.sqrt(mom.sigma2 / HIST_N[0]),
    vars: Math.sqrt(Welford.theory(mom, HIST_N[0]).varS2),
  };
  const spec = [
    ["means", "histMeans", "means", mom.mu, (n) => Math.sqrt(mom.sigma2 / n), "M_n"],
    ["vars", "histVars", "vars", mom.sigma2, (n) => Math.sqrt(Welford.theory(mom, n).varS2), "s²_n"],
  ];
  for (const [key, el, field, center, sdOf, name] of spec) {
    if (histPlots[key].length === 0) {
      $(el).innerHTML = HIST_N.map((n) => `<div><div class="chart"></div><div class="status" style="text-align:center">n = ${n}</div></div>`).join("");
      histPlots[key] = [...$(el).querySelectorAll(".chart")].map((c) => new Plot(c, 150));
    }
    const lo = Math.max(0, center - 3.2 * sdMax[key]);
    const hi = center + 4 * sdMax[key];
    HIST_N.forEach((n, i) => {
      const r = rows.find((q) => q.n === n);
      const step = key === "means" ? Math.ceil(((hi - lo) / 40) * n) / n : (hi - lo) / 30;
      const start = key === "means" ? Math.floor(lo * n) / n - 1 / (2 * n) : lo;
      const bins = hist(r[field], start, hi, step);
      const sd = sdOf(n);
      const curve = [];
      for (let t = 0; t <= 300; t++) {
        const x = lo + ((hi - lo) * t) / 300;
        const z = (x - center) / sd;
        curve.push([x, Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI))]);
      }
      const yMax = Math.max(...bins.map((b) => b.y), ...curve.map((c) => c[1])) * 1.08;
      const pl = histPlots[key][i].begin({ min: lo, max: hi }, { min: 0, max: yMax }, { l: 8, r: 8, t: 6, b: 22 });
      pl.axes(niceTicks(lo, hi, 3), [0], (v) => fmt(v, 1), () => "");
      pl.bars(bins, css("--s2"));
      pl.line(curve, css("--s1"), 2);
      pl.hover = (px) => {
        const x = pl.invX(px);
        const b = bins.find((q) => x >= q.x0 && x < q.x1);
        return b ? `n = ${n}, ${name} in [${fmt(b.x0)}, ${fmt(b.x1)})\n${b.count} of ${r.m} hackers` : null;
      };
    });
  }
}

let runPlot;
function drawRunning() {
  const { mom, paths, runQty } = state;
  const target = runQty === "M" ? mom.mu : mom.sigma2;
  const series = paths.map((p) => p[runQty]);
  const ks = [];
  for (let k = 2; k <= RUN_N; k = Math.max(k + 1, Math.round(k * 1.03))) ks.push(k);
  const lines = series.map((a) => ks.map((k) => [k, a[k - 1]]));
  const vals = lines.flat().map((q) => q[1]);
  const yMin = Math.min(target, ...vals), yMax = Math.max(target, ...vals);
  const pad = (yMax - yMin) * 0.05;
  runPlot = runPlot || new Plot($("runChart"), 250);
  const pl = runPlot.begin({ min: 2, max: RUN_N, log: true }, { min: yMin - pad, max: yMax + pad });
  pl.axes([10, 100, 1000], niceTicks(yMin, yMax, 5), String, (v) => fmt(v, 1), "k = systems attempted (log scale)");
  for (const l of lines) pl.line(l, css("--muted"), 1.5, null, 0.75);
  pl.line([[2, target], [RUN_N, target]], css("--s1"), 2, [5, 4]);
  pl.hover = (px) => {
    const k = Math.max(2, Math.min(RUN_N, Math.round(pl.invX(px))));
    return `k = ${k}\n` + series.map((a, i) => `hacker ${i + 1}: ${a[k - 1].toFixed(3)}`).join("\n") + `\ntrue value: ${target.toFixed(3)}`;
  };
  legend($("runLegend"), [[`${RUN_COUNT} hackers`, css("--muted")], [runQty === "M" ? "μ" : "σ²", css("--s1")]]);
}

function drawAll() {
  if (!state.rows) return;
  drawPmf();
  drawResults();
  drawSpread();
  drawHistograms();
  drawRunning();
}

async function runExperiment() {
  const dist = Welford.DISTRIBUTIONS[$("distSel").value];
  const m = parseInt($("mSel").value, 10);
  state.pmf = dist.pmf;
  state.mom = Welford.moments(dist.pmf);
  $("runBtn").disabled = true;
  const t0 = performance.now();
  const rows = [];
  for (const n of SIZES) {
    $("runStatus").textContent = `m = ${m}, n = ${n}…`;
    await yieldToBrowser();
    rows.push(Welford.experiment(dist.pmf, m, n, 1000 + n, T975[n]));
  }
  state.rows = rows;
  state.paths = Welford.trajectories(dist.pmf, RUN_COUNT, RUN_N, 99);
  $("runStatus").textContent = `done in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  $("runBtn").disabled = false;
  drawAll();
}

// ---------------------------------------------------------------- controls

for (const [id, d] of Object.entries(Welford.DISTRIBUTIONS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = d.label;
  $("distSel").appendChild(o);
}

$("traceBtn").addEventListener("click", runTrace);
$("runBtn").addEventListener("click", runExperiment);
$("runQty").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $("runQty").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  state.runQty = b.dataset.v;
  if (state.rows) drawRunning();
});

let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawAll, 150); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawAll);

runTrace();
stabilityTable();
runExperiment();
