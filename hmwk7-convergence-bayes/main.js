"use strict";

// Page logic: every number in the tables and charts is computed here, from the functions in prob.js.

const tableHTML = (head, body) =>
  `<div class="table-wrap"><table class="defs num-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
  body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";

function segment(el, onChange) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
  return () => el.querySelector("button.on").dataset.v;
}

const f3 = (v) => v.toFixed(3), f4 = (v) => v.toFixed(4);
const pct = (v, d = 1) => (100 * v).toFixed(d) + "%";
const later = (fn) => setTimeout(fn, 20);
const small = (v) => (v < 1e-3 || v >= 1e4 ? v.toExponential(1) : fmt(v, 4));

// ================================================================ 02 counterexamples

const CE_N = 10000, CE_PATHS = 2000, CE_SHOW = 30;
let ceKind = () => "bern";

function renderCounterexample() {
  const kind = ceKind();
  const paths = counterexample(kind, CE_PATHS, CE_N, 11);
  const p = new Plot($("ceChart"), 260);
  p.begin({ min: 1, max: CE_N, log: true }, { min: -0.5, max: CE_SHOW - 0.5 }, { l: 46, r: 16, t: 10, b: 30 });
  p.axes(logTicks(1, CE_N), [], pow10Fmt, String, "n (log scale)");
  const ctx = p.ctx;
  ctx.fillStyle = css("--muted");
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.save(); ctx.translate(14, p.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
  ctx.fillText(`${CE_SHOW} paths ω`, 0, 0); ctx.restore();
  p.clip((c) => {
    c.fillStyle = css("--s1");
    paths.slice(0, CE_SHOW).forEach((hits, row) => {
      for (const n of hits) c.fillRect(p.X(n) - 1.5, p.Y(row) - 3, 3, 6);
    });
  });
  p.hover = (px, py) => {
    const row = Math.round(p.y.max - ((py - p.pad.t) / (p.h - p.pad.t - p.pad.b)) * (p.y.max - p.y.min));
    if (row < 0 || row >= CE_SHOW) return null;
    const h = paths[row];
    return `path ${row + 1}: X_n ≠ 0 at ${h.length} indices ≤ ${CE_N}\n` +
      (h.length ? `last one at n = ${h[h.length - 1]}` : "none");
  };

  const rows = [10, 100, 1000].map((n) => {
    const now = paths.filter((h) => h.includes(n)).length / CE_PATHS;
    const any = paths.filter((h) => h.some((m) => m >= n)).length / CE_PATHS;
    const exactAny = kind === "bern" ? 1 - (n - 1) / CE_N : 1 / n;
    return [n, `${f4(now)} <span class="muted">(${f4(1 / n)})</span>`,
      kind === "bern" ? `1/n = ${f4(1 / n)}` : `n = ${n}`,
      `${f4(any)} <span class="muted">(${f4(exactAny)})</span>`,
      kind === "bern" ? "1" : `1/n = ${f4(1 / n)}`];
  });
  $("ceTable").innerHTML = tableHTML(
    ["n", "P(X<sub>n</sub> ≠ 0)", "E X<sub>n</sub>²", "P(X<sub>m</sub> ≠ 0 for some m in [n, 10⁴])", "same, m ≥ n unbounded"], rows);
  $("ceNote").innerHTML = kind === "bern"
    ? "Every path keeps producing ones, but they get rarer: the probability of a one at time n goes to 0 (convergence in probability, and in L² since E X<sub>n</sub>² = 1/n), while the probability of at least one more one after n is 1 for every n, so almost no path converges."
    : "Each path is n up to the random time 1/U and 0 afterwards, so every path converges to 0 (almost surely). But the rare non-zero values grow like n, and E X<sub>n</sub>² = n² · (1/n) = n diverges: no convergence in L².";
}

// ================================================================ 03 LLN and CLT

const LLN_N = 5000, LLN_M = 2000, CPS = [1, 2, 5, 10, 30, 100, 300, 1000, 5000];
let llnRun = null;

function simulateLLN() {
  $("llnStatus").textContent = "simulating…";
  later(() => {
    const t0 = performance.now();
    llnRun = runningMeans($("llnLaw").value, LLN_M, LLN_N, CPS, Number($("llnEps").value), 21);
    $("llnStatus").textContent = `${LLN_M} paths × ${LLN_N} draws, ${(performance.now() - t0).toFixed(0)} ms`;
    drawLLN();
    drawCLT();
  });
}

function drawLLN() {
  const r = llnRun, law = r.law, eps = Number($("llnEps").value);
  const finite = Number.isFinite(law.sigma);
  const span = Math.max(4 * eps, law.mu ? 0.9 * Math.abs(law.mu) : 1.5);
  const lo = r.centre - span, hi = r.centre + span;
  const p = new Plot($("llnChart"), 280);
  p.begin({ min: 1, max: LLN_N, log: true }, { min: lo, max: hi });
  p.axes(logTicks(1, LLN_N), niceTicks(lo, hi, 6), pow10Fmt, (v) => fmt(v, 2), "n (log scale)");
  p.band([1, LLN_N], [r.centre - eps, r.centre - eps], [r.centre + eps, r.centre + eps], css("--s2"), 0.18);
  for (const path of r.paths) p.line(path, css("--s1"), 1, null, 0.45);
  p.line([[1, r.centre], [LLN_N, r.centre]], css("--s2"), 2, [5, 4]);
  p.hover = (px) => {
    const n = Math.round(p.invX(px));
    if (n < 1 || n > LLN_N) return null;
    const vals = r.paths.map((pt) => pt.reduce((best, q) => (Math.abs(q[0] - n) < Math.abs(best[0] - n) ? q : best))[1]);
    const out = vals.filter((v) => Math.abs(v - r.centre) > eps).length;
    return `n ≈ ${n}\n${out} of ${vals.length} plotted paths outside the band`;
  };
  legend($("llnLegend"), [["running mean of one path", css("--s1")],
    [Number.isFinite(law.mu) ? `μ = ${law.mu} and the band μ ± ε` : "median 0 and the band ± ε (no mean exists)", css("--s2"), "dash"]]);

  const rows = CPS.map((n, c) => {
    const a = r.at[c];
    const pr = a.filter((v) => Math.abs(v - r.centre) > eps).length / a.length;
    const sup = Array.from(r.last).filter((l) => l >= n).length / a.length;
    const msq = a.reduce((s, v) => s + (v - r.centre) ** 2, 0) / a.length;
    return [n, f3(pr), finite ? f3(Math.min(1, law.sigma ** 2 / (n * eps * eps))) : "–", f3(sup),
      small(msq), finite ? small(law.sigma ** 2 / n) : "∞"];
  });
  $("llnTable").innerHTML = tableHTML(
    ["n", "P(|X̄<sub>n</sub> − μ| &gt; ε)", "Chebyshev σ²/(nε²)", `P(|X̄<sub>m</sub> − μ| &gt; ε for some m in [n, ${LLN_N}])`, "E(X̄<sub>n</sub> − μ)²", "σ²/n"], rows);
}

function drawCLT() {
  const r = llnRun, law = r.law, n = Number($("cltN").value);
  const c = CPS.indexOf(n), finite = Number.isFinite(law.sigma);
  const z = Array.from(r.at[c], (v) => (finite ? (Math.sqrt(n) * (v - law.mu)) / law.sigma : v - r.centre));
  const lo = -4, hi = 4, bins = 48, w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
  for (const v of z) if (v >= lo && v < hi) cnt[Math.floor((v - lo) / w)]++;
  const dens = cnt.map((k) => k / (z.length * w));
  const ymax = Math.max(0.45, ...dens) * 1.1;
  const p = new Plot($("cltChart"), 250);
  p.begin({ min: lo, max: hi }, { min: 0, max: ymax });
  p.axes(niceTicks(lo, hi, 8), niceTicks(0, ymax, 4), String, (v) => fmt(v, 1),
    finite ? "Z_n = √n (X̄_n − μ) / σ" : "X̄_n − centre (no √n scaling: σ is not finite)");
  p.bars(dens.map((d, k) => ({ x0: lo + k * w, x1: lo + (k + 1) * w, y: d })), css("--s1"));
  const items = [["histogram of the 2000 values", css("--s1")]];
  if (finite) {
    const curve = [];
    for (let x = lo; x <= hi + 1e-9; x += 0.05) curve.push([x, Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)]);
    p.line(curve, css("--s2"), 2);
    items.push(["N(0, 1) density", css("--s2")]);
  }
  p.hover = (px) => {
    const k = Math.floor((p.invX(px) - lo) / w);
    if (k < 0 || k >= bins) return null;
    return `[${(lo + k * w).toFixed(2)}, ${(lo + (k + 1) * w).toFixed(2)})\n${cnt[k]} of ${z.length} values`;
  };
  legend($("cltLegend"), items);
  const outside = z.filter((v) => v < lo || v >= hi).length;
  let txt = finite
    ? `n = ${n}:  Kolmogorov distance sup |F̂(z) − Φ(z)| = ${f3(ksNormal(z))}\n  (with 2000 values, up to about 0.03 is sampling noise)`
    : `n = ${n}:  σ is ${Number.isNaN(law.sigma) ? "undefined" : "infinite"}, the CLT does not apply`;
  if (outside) txt += `\n${outside} value${outside === 1 ? " falls" : "s fall"} outside [−4, 4] and ${outside === 1 ? "is" : "are"} not drawn`;
  if (finite) {
    const i1 = CPS.indexOf(1000), i2 = CPS.indexOf(5000);
    const za = Array.from(r.at[i1], (v) => (Math.sqrt(1000) * (v - law.mu)) / law.sigma);
    const zb = Array.from(r.at[i2], (v) => (Math.sqrt(5000) * (v - law.mu)) / law.sigma);
    const m = za.length, ma = za.reduce((s, v) => s + v) / m, mb = zb.reduce((s, v) => s + v) / m;
    let cab = 0, va = 0, vb = 0, vd = 0;
    for (let i = 0; i < m; i++) { cab += (za[i] - ma) * (zb[i] - mb); va += (za[i] - ma) ** 2; vb += (zb[i] - mb) ** 2; vd += (zb[i] - za[i]) ** 2; }
    txt += `\nsame paths at n = 1000 and n = 5000:` +
      `\n  corr(Z_1000, Z_5000) = ${f3(cab / Math.sqrt(va * vb))}   theory √(1000/5000) = 0.447` +
      `\n  E(Z_5000 − Z_1000)²  = ${f3(vd / m)}   theory 2 − 2·0.447 = 1.106`;
  }
  $("cltOut").textContent = txt;
}

// ================================================================ 04 why sqrt(n)

let sqrtData = null;
function renderSqrt() {
  $("sqrtStatus").textContent = "simulating…";
  later(() => {
    const t0 = performance.now();
    const ns = []; for (let k = 0; k <= 12; k++) ns.push(2 ** k);
    sqrtData = { ns, v: spreadOfMean(2000, ns, 31) };
    $("sqrtStatus").textContent = `2000 replications of each sequence up to n = 4096, ${(performance.now() - t0).toFixed(0)} ms`;
    drawSqrt();
  });
}

function drawSqrt() {
  const { ns, v } = sqrtData;
  const series = [
    ["iid", "independent N(0, 1)", css("--s1")],
    ["ar", "AR(1), ρ = 0.8", css("--s2")],
    ["equi", "equicorrelated, ρ = 0.1", css("--s3")],
    ["cauchy", "independent Cauchy", css("--s4")],
  ];
  const p = new Plot($("sqrtChart"), 300);
  p.begin({ min: 1, max: 4096, log: true }, { min: 0.01, max: 3, log: true });
  p.axes(logTicks(1, 4096), [0.01, 0.1, 1], pow10Fmt, (v) => String(v), "n (log scale)");
  const rows = [];
  for (const [key, label, col] of series) {
    const sp = v[key].map((a) => robustSpread(a));
    const th = [];
    for (let n = 1; n <= 4096; n *= 1.25) th.push([n, theorySpread(key, n)]);
    th.push([4096, theorySpread(key, 4096)]);
    p.line(th, col, 2, [5, 4]);
    p.dots(ns.map((n, i) => [n, sp[i]]), col, 3);
    const big = ns.map((n, i) => [n, sp[i]]).filter(([n]) => n >= 64);
    rows.push([label, f3(logSlope(big.map((x) => x[0]), big.map((x) => x[1]))), f4(sp[ns.length - 1]), f4(theorySpread(key, 4096))]);
    series.find((s) => s[0] === key).push(sp);
  }
  p.hover = (px) => {
    const i = Math.round(Math.log2(p.invX(px)));
    if (i < 0 || i >= ns.length) return null;
    return `n = ${ns[i]}\n` + series.map((s) => `${s[1]}: ${f4(s[3][i])}  (theory ${f4(theorySpread(s[0], ns[i]))})`).join("\n");
  };
  legend($("sqrtLegend"), series.map((s) => [s[1], s[2]]));
  $("sqrtTable").innerHTML = tableHTML(["sequence", "fitted slope, n = 64…4096", "spread at n = 4096", "theory"], rows);
}

// ================================================================ 05 diagnostic test

function ppv(prev, se, sp) { return (se * prev) / (se * prev + (1 - sp) * (1 - prev)); }

function renderTest() {
  const prev = Number($("dxPrev").value) / 100, se = Number($("dxSe").value) / 100, sp = Number($("dxSp").value) / 100;
  const ok = [prev, se, sp].every((v) => v > 0 && v < 1);
  if (!ok) { $("dxOut").textContent = "all three values must be strictly between 0 and 100"; return; }
  const N = 100000, sick = N * prev, healthy = N - sick;
  const tp = sick * se, fn = sick - tp, fp = healthy * (1 - sp), tn = healthy - fp;
  const r = (v) => Math.round(v).toLocaleString("en-US");
  $("dxTable").innerHTML = tableHTML(["out of 100,000 people", "test positive", "test negative", "total"], [
    ["disease", r(tp), r(fn), r(sick)],
    ["no disease", r(fp), r(tn), r(healthy)],
    ["total", r(tp + fp), r(fn + tn), r(N)],
  ]);
  const p1 = ppv(prev, se, sp), p2 = ppv(p1, se, sp), n1 = ((1 - se) * prev) / ((1 - se) * prev + sp * (1 - prev));
  $("dxOut").textContent =
    `prior          P(D)        = ${pct(prev, 2)}\n` +
    `likelihoods    P(+ | D)    = ${pct(se, 1)},   P(+ | not D) = ${pct(1 - sp, 1)}\n` +
    `posterior      P(D | +)    = ${pct(se * prev, 3)} / (${pct(se * prev, 3)} + ${pct((1 - sp) * (1 - prev), 3)}) = ${pct(p1, 2)}\n` +
    `               P(D | −)    = ${pct(n1, 4)}\n` +
    `second test, also positive (errors independent given the disease status):\n` +
    `               P(D | +, +) = ${pct(p2, 2)}   (the first posterior ${pct(p1, 2)} is now the prior)`;

  const p = new Plot($("dxChart"), 240);
  p.begin({ min: 1e-4, max: 0.5, log: true }, { min: 0, max: 1 });
  p.axes([1e-4, 1e-3, 1e-2, 1e-1], [0, 0.25, 0.5, 0.75, 1], (v) => pct(v, v < 0.01 ? 2 : 0), (v) => pct(v, 0), "prior P(D), log scale");
  const c1 = [], c2 = [];
  for (let e = -4; e <= Math.log10(0.5) + 1e-9; e += 0.02) {
    const q = Math.pow(10, e);
    c1.push([q, ppv(q, se, sp)]); c2.push([q, ppv(ppv(q, se, sp), se, sp)]);
  }
  p.line(c1, css("--s1"), 2);
  p.line(c2, css("--s2"), 2, [5, 4]);
  if (prev >= 1e-4 && prev <= 0.5) p.dots([[prev, p1], [prev, p2]], css("--s3"), 4);
  p.hover = (px) => {
    const q = p.invX(px);
    if (q < 1e-4 || q > 0.5) return null;
    return `prior ${pct(q, 3)}\nP(D | +) = ${pct(ppv(q, se, sp), 2)}\nP(D | +, +) = ${pct(ppv(ppv(q, se, sp), se, sp), 2)}`;
  };
  legend($("dxLegend"), [["P(D | +)", css("--s1")], ["P(D | +, +)", css("--s2"), "dash"], ["current prior", css("--s3")]]);
}

// ================================================================ 06 Beta-Binomial

const PRIORS = {
  uniform: [1, 1, "uniform, Beta(1, 1)"],
  jeffreys: [0.5, 0.5, "Jeffreys, Beta(½, ½)"],
  sceptical: [20, 20, "sceptical, Beta(20, 20)"],
  men: [63, 37, "men's rate in B, Beta(63, 37)"],
};

function priorAB() {
  const key = $("bbPrior").value;
  if (key === "custom") return [Number($("bbA").value), Number($("bbB").value)];
  return PRIORS[key].slice(0, 2);
}

function renderBeta() {
  const [a, b] = priorAB();
  const k = Math.round(Number($("bbK").value)), n = Math.round(Number($("bbN").value));
  $("bbCustom").style.display = $("bbPrior").value === "custom" ? "contents" : "none";
  if (!(a > 0 && b > 0) || !(n >= 1) || !(k >= 0 && k <= n)) { $("bbOut").textContent = "need a, b > 0 and 0 ≤ k ≤ n, n ≥ 1"; return; }
  const po = posterior(a, b, k, n);
  const xs = []; for (let i = 1; i < 600; i++) xs.push(i / 600);
  const prior = xs.map((x) => [x, betaPdf(x, a, b)]);
  const like = xs.map((x) => [x, betaPdf(x, k + 1, n - k + 1)]); // likelihood rescaled to unit area
  const post = xs.map((x) => [x, betaPdf(x, po.A, po.B)]);
  const ymax = Math.min(60, Math.max(...post.map((q) => q[1]), ...like.map((q) => q[1]), ...prior.slice(30, -30).map((q) => q[1])) * 1.12);
  const p = new Plot($("bbChart"), 270);
  p.begin({ min: 0, max: 1 }, { min: 0, max: ymax });
  p.axes([0, 0.2, 0.4, 0.6, 0.8, 1], niceTicks(0, ymax, 4), String, (v) => fmt(v, 1), "θ = probability of admission");
  p.band([po.lo, po.hi], [0, 0], [ymax, ymax], css("--s3"), 0.08);
  p.line(prior, css("--s1"), 2, [5, 4]);
  p.line(like, css("--s2"), 2);
  p.line(post, css("--s3"), 2.5);
  p.hover = (px) => {
    const x = p.invX(px);
    if (x <= 0 || x >= 1) return null;
    return `θ = ${x.toFixed(3)}\nprior ${betaPdf(x, a, b).toFixed(3)}\nlikelihood (scaled) ${betaPdf(x, k + 1, n - k + 1).toFixed(3)}\nposterior ${betaPdf(x, po.A, po.B).toFixed(3)}`;
  };
  legend($("bbLegend"), [["prior", css("--s1"), "dash"], ["likelihood, scaled to area 1", css("--s2")], ["posterior", css("--s3")], ["95% credible interval", css("--s3")]]);
  const mle = k / n, h = Z975 * Math.sqrt((mle * (1 - mle)) / n);
  $("bbOut").textContent =
    `prior       Beta(${a}, ${b}),  mean ${f4(a / (a + b))},  worth a + b = ${a + b} observations\n` +
    `data        k = ${k} admitted out of n = ${n}  →  likelihood ∝ θ^${k} (1 − θ)^${n - k},  MLE k/n = ${f4(mle)}\n` +
    `posterior   Beta(${a} + ${k}, ${b} + ${n - k}) = Beta(${+po.A.toFixed(3)}, ${+po.B.toFixed(3)})\n` +
    `            mean ${f4(po.mean)} = ${f3(po.w)} · prior mean + ${f3(1 - po.w)} · MLE,  sd ${f4(po.sd)}\n` +
    `            95% credible interval [${f4(po.lo)}, ${f4(po.hi)}],  P(θ > 0.5 | data) = ${f4(1 - betaCdf(0.5, po.A, po.B))}\n` +
    `frequentist Wald 95% confidence interval k/n ± 1.96 √(p̂(1 − p̂)/n) = [${f4(mle - h)}, ${f4(mle + h)}]`;
}

// sequential updating with a uniform prior on simulated coin flips with theta = 0.3
function renderSequential() {
  const rand = rng(5), T = 400, theta = 0.3;
  let k = 0;
  const mean = [], lo = [], hi = [], ns = [], sdn = [];
  for (let n = 1; n <= T; n++) {
    if (rand() < theta) k++;
    const po = posterior(1, 1, k, n);
    ns.push(n); mean.push(po.mean); lo.push(po.lo); hi.push(po.hi); sdn.push(po.sd * Math.sqrt(n));
  }
  const p = new Plot($("seqChart"), 240);
  p.begin({ min: 1, max: T }, { min: 0, max: 1 });
  p.axes(niceTicks(0, T, 8).filter((v) => v >= 1 || v === 0), [0, 0.25, 0.5, 0.75, 1], String, String, "number of observations n");
  p.band(ns, lo, hi, css("--s3"), 0.2);
  p.line(ns.map((n, i) => [n, mean[i]]), css("--s3"), 2);
  p.line([[1, theta], [T, theta]], css("--s2"), 2, [5, 4]);
  p.hover = (px) => {
    const i = Math.round(p.invX(px)) - 1;
    if (i < 0 || i >= T) return null;
    return `n = ${ns[i]}\nposterior mean ${f3(mean[i])}\n95% interval [${f3(lo[i])}, ${f3(hi[i])}]\nsd · √n = ${f3(sdn[i])}`;
  };
  legend($("seqLegend"), [["posterior mean", css("--s3")], ["95% credible band", css("--s3")], ["true θ = 0.3", css("--s2"), "dash"]]);
  const at = (n) => `n = ${n}: sd = ${f4(sdn[n - 1] / Math.sqrt(n))}, sd·√n = ${f3(sdn[n - 1])}`;
  $("seqOut").textContent = [10, 100, 400].map(at).join("\n") + `\n√(θ(1 − θ)) = ${f3(Math.sqrt(theta * (1 - theta)))}`;
}

// ================================================================ 07 influence of the prior, coverage

function renderPriorTable() {
  const rows = Object.values(PRIORS).map(([a, b, label]) => [label, ...[1, 10, 100].map((s) => {
    const po = posterior(a, b, 17 * s, 25 * s);
    return `${f3(po.mean)} [${f3(po.lo)}, ${f3(po.hi)}]`;
  })]);
  $("priorTable").innerHTML = tableHTML(["prior", "17 of 25 (observed)", "170 of 250", "1700 of 2500"], rows);
}

function renderCoverage() {
  const n = Number($("covN").value);
  const methods = [["wald", "Wald interval", css("--s1")], ["uniform", "credible, uniform prior", css("--s3")], ["jeffreys", "credible, Jeffreys prior", css("--s2")]];
  const grid = []; for (let i = 1; i < 500; i++) grid.push(i / 500);
  const p = new Plot($("covChart"), 260);
  p.begin({ min: 0, max: 1 }, { min: 0.5, max: 1 });
  p.axes([0, 0.2, 0.4, 0.6, 0.8, 1], [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1], String, (v) => pct(v, 0), "true θ");
  const curves = methods.map(([m]) => { const ints = intervals(m, n); return grid.map((q) => coverage(ints, n, q)); });
  p.line([[0, 0.95], [1, 0.95]], css("--muted"), 1, [3, 3]);
  methods.forEach(([, , col], i) => p.line(grid.map((q, j) => [q, curves[i][j]]), col, 1.6));
  p.hover = (px) => {
    const j = Math.round(p.invX(px) * 500) - 1;
    if (j < 0 || j >= grid.length) return null;
    return `θ = ${grid[j].toFixed(3)}\n` + methods.map(([, l], i) => `${l}: ${pct(curves[i][j], 1)}`).join("\n");
  };
  legend($("covLegend"), methods.map(([, l, c]) => [l, c]));
  const inner = grid.map((q, j) => j).filter((j) => grid[j] >= 0.05 && grid[j] <= 0.95);
  $("covTable").innerHTML = tableHTML(["interval, n = " + n, "coverage at θ = 0.1", "at θ = 0.5", "average over θ", "minimum for θ in [0.05, 0.95]"],
    methods.map(([m, l], i) => {
      const ints = intervals(m, n);
      return [l, pct(coverage(ints, n, 0.1)), pct(coverage(ints, n, 0.5)), pct(curves[i].reduce((s, v) => s + v) / grid.length),
        pct(Math.min(...inner.map((j) => curves[i][j])))];
    }));
}

// ================================================================ start

ceKind = segment($("ceKind"), renderCounterexample);
renderCounterexample();

$("llnLaw").innerHTML = Object.entries(LAWS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join("");
$("llnLaw").addEventListener("change", simulateLLN);
$("llnEps").addEventListener("change", simulateLLN);
$("cltN").innerHTML = CPS.map((n) => `<option${n === 30 ? " selected" : ""}>${n}</option>`).join("");
$("cltN").addEventListener("change", drawCLT);
simulateLLN();
renderSqrt();

for (const id of ["dxPrev", "dxSe", "dxSp"]) $(id).addEventListener("input", renderTest);
renderTest();

$("bbPrior").innerHTML = Object.entries(PRIORS).map(([k, v]) => `<option value="${k}">${v[2]}</option>`).join("") + '<option value="custom">custom Beta(a, b)</option>';
for (const id of ["bbPrior", "bbA", "bbB", "bbK", "bbN"]) $(id).addEventListener("input", renderBeta);
renderBeta();
renderSequential();
renderPriorTable();
$("covN").addEventListener("change", renderCoverage);
renderCoverage();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderCounterexample(); if (llnRun) { drawLLN(); drawCLT(); }
    if (sqrtData) drawSqrt();
    renderTest(); renderBeta(); renderSequential(); renderCoverage();
  }, 200);
});
