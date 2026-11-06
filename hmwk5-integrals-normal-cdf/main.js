"use strict";

// Page wiring for HMWK5. The numerical methods are in integrals.js and normcdf.js.

const NS = [3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383];
const N_REPORT = 4095;
const FLOOR = 1e-16;
const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));
const F = Integrals.FUNCTIONS;

function logLogSlope(xs, ys) {
  const pts = xs.map((x, i) => [Math.log(x), Math.log(ys[i])]).filter((p) => Number.isFinite(p[1]));
  if (pts.length < 2) return NaN;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return num / den;
}

function msPerRun(fn) {
  let reps = 0;
  const t0 = performance.now();
  let t1 = t0;
  while (t1 - t0 < 60 || reps < 3) { fn(); reps++; t1 = performance.now(); }
  return (t1 - t0) / reps;
}

function fillFnSelect(sel, def) {
  sel.innerHTML = F.map((f) => `<option value="${f.key}"${f.key === def ? " selected" : ""}>${f.label}</option>`).join("");
}
const fnByKey = (k) => F.find((f) => f.key === k);

// ================================================================ Ex. 1

const METHODS1 = [
  ["rr", "Riemann, right", (fn, N) => Integrals.riemann(fn, N, "right"), "--s1", [5, 4]],
  ["rm", "Riemann, midpoint", (fn, N) => Integrals.riemann(fn, N, "mid"), "--s1", null],
  ["ll", "Lebesgue, lower", (fn, N) => Integrals.lebesgue(fn, N, "lower"), "--s2", [5, 4]],
  ["lm", "Lebesgue, middle level", (fn, N) => Integrals.lebesgue(fn, N, "mid"), "--s2", null],
];
const conv = {};

function computeConvergence() {
  for (const fn of F) {
    const e = (conv[fn.key] = {});
    for (const [key, , method] of METHODS1) e[key] = NS.map((N) => Math.abs(method(fn, N) - fn.exact));
  }
}

function fnTable() {
  let html = `<table class="defs"><thead><tr><th>f</th><th>exact integral</th><th>range</th><th>preimage used by Lebesgue</th></tr></thead><tbody>`;
  for (const fn of F) {
    const short = (v) => String(+v.toFixed(4));
    const hi = Number.isFinite(fn.hi) ? short(fn.hi) : "∞";
    html += `<tr><td>${fn.label}</td><td class="mono">${fn.exact.toPrecision(16)}</td><td class="mono">[${short(fn.lo)}, ${hi}]</td><td class="mono small">${fn.pre}</td></tr>`;
  }
  $("fnTable").innerHTML = html + `</tbody></table>`;
}

function errTable() {
  const iRep = NS.indexOf(N_REPORT), from = NS.indexOf(63);
  let html = `<table class="defs num-table"><thead><tr><th>f</th>` +
    METHODS1.map((m) => `<th>${m[1]}</th>`).join("") + `</tr></thead><tbody>`;
  for (const fn of F) {
    const e = conv[fn.key];
    const vals = METHODS1.map(([k]) => e[k][iRep]);
    const best = Math.min(...vals);
    html += `<tr><td>${fn.label}</td>` + METHODS1.map(([k], j) => {
      const s = logLogSlope(NS.slice(from), e[k].slice(from).map((v) => (v < 1e-12 ? NaN : v)));
      const slope = Number.isFinite(s) ? ` (${s.toFixed(2)})` : " (exact)";
      return `<td class="${vals[j] === best ? "best" : ""}">${vals[j] < 1e-12 ? "≈ 0" : vals[j].toExponential(1)}${slope}</td>`;
    }).join("") + `</tr>`;
  }
  $("errTable").innerHTML = html + `</tbody></table><p class="hint">Error at N = ${N_REPORT}; slope fitted for N ≥ 63. "≈ 0" means below 10<sup>−12</sup>, rounding only. The smallest error in each row is highlighted.</p>`;
}

let convPlot;
function drawConvergence() {
  const fn = fnByKey($("convFn").value), e = conv[fn.key];
  convPlot = convPlot || new Plot($("convChart"), 280);
  const pl = convPlot.begin({ min: 2, max: 20000, log: true }, { min: 1e-17, max: 10, log: true });
  pl.axes(logTicks(2, 20000), [1e-16, 1e-12, 1e-8, 1e-4, 1], pow10Fmt, pow10Fmt, "N (log scale)");
  for (const [k, , , color, dash] of METHODS1) {
    const pts = NS.map((N, i) => [N, Math.max(FLOOR, e[k][i])]);
    pl.line(pts, css(color), 2, dash);
    pl.dots(pts, css(color), dash ? 3 : 4);
  }
  pl.hover = (px) => {
    const x = pl.invX(px);
    const i = NS.reduce((b, N, j) => (Math.abs(Math.log(N / x)) < Math.abs(Math.log(NS[b] / x)) ? j : b), 0);
    return `N = ${NS[i]}\n` + METHODS1.map(([k, label]) => `${label}: ${e[k][i].toExponential(2)}`).join("\n");
  };
  legend($("convLegend"), METHODS1.map(([, label, , color, dash]) => [label, css(color), dash ? "dash" : ""]));
}

// ---------------------------------------------------------------- picture of the two sums

let picPlot, picMode = "R";
function drawPicture() {
  const fn = fnByKey($("picFn").value), N = Number($("picN").value);
  const yMax = Number.isFinite(fn.hi) ? fn.hi * 1.1 : 6;
  const yMin = Math.min(0, fn.lo);
  picPlot = picPlot || new Plot($("picChart"), 260);
  const pl = picPlot.begin({ min: fn.a, max: fn.b }, { min: yMin, max: yMax });
  pl.axes(niceTicks(fn.a, fn.b, 6), niceTicks(yMin, yMax, 4), (v) => fmt(v, 2), (v) => fmt(v, 2), "x");
  const L = fn.b - fn.a, h = L / N, t = Integrals.levels(fn, N);
  const fill = picMode === "R" ? css("--s1") : css("--s2");
  pl.clip((ctx) => {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = fill;
    for (let px = Math.floor(pl.pad.l); px < pl.w - pl.pad.r; px++) {
      const x = pl.invX(px + 0.5);
      let v;
      if (picMode === "R") {
        const k = Math.min(N - 1, Math.max(0, Math.floor((x - fn.a) / h)));
        v = fn.f(fn.a + (k + 0.5) * h);
      } else {
        const fx = fn.f(x);
        let k = 0;
        while (k < N && t[k + 1] <= fx) k++;
        v = t[k];
      }
      const y0 = pl.Y(0), y1 = pl.Y(Math.min(v, yMax * 2));
      ctx.fillRect(px, Math.min(y0, y1), 1, Math.abs(y0 - y1));
    }
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = css("--muted");
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    if (picMode === "R") {
      for (let k = 1; k < N; k++) { const px = Math.round(pl.X(fn.a + k * h)) + 0.5; ctx.moveTo(px, pl.Y(yMin)); ctx.lineTo(px, pl.Y(yMax)); }
    } else {
      for (let k = 0; k <= N; k++) { if (t[k] > yMax) break; const py = Math.round(pl.Y(t[k])) + 0.5; ctx.moveTo(pl.pad.l, py); ctx.lineTo(pl.w - pl.pad.r, py); }
    }
    ctx.stroke();
  });
  const curve = [];
  for (let i = 0; i <= 800; i++) {
    const x = fn.a + (L * Math.max(i, 0.02)) / 800;
    curve.push([x, Math.min(fn.f(x), yMax * 2)]);
  }
  pl.line(curve, css("--paper"), 2);
  pl.hover = (px) => {
    const x = pl.invX(px);
    if (x < fn.a || x > fn.b) return null;
    return `x = ${x.toFixed(3)}\nf(x) = ${fmt(fn.f(x), 4)}`;
  };
  const R = Integrals.riemann(fn, N, "mid"), Lb = Integrals.lebesgue(fn, N, "lower");
  $("picOut").textContent =
    `N = ${N}\n` +
    `Riemann midpoint sum   ${R.toFixed(6)}   error ${(R - fn.exact).toExponential(2)}\n` +
    `Lebesgue lower sum     ${Lb.toFixed(6)}   error ${(Lb - fn.exact).toExponential(2)}\n` +
    `exact                  ${fn.exact.toFixed(6)}` +
    (fn.geometric ? `\nlevels: geometric from 1 to N² = ${N * N} (the chart is cut at 6)` : "");
}

// ---------------------------------------------------------------- cost

async function timeTable() {
  $("timeStatus").textContent = "measuring…";
  $("timeBtn").disabled = true;
  await yieldToBrowser();
  const N = N_REPORT;
  let html = `<table class="defs num-table"><thead><tr><th>f</th><th>evaluations (Riemann)</th><th>evaluations (Lebesgue)</th>` +
    `<th>Riemann midpoint, ms</th><th>Lebesgue middle level, ms</th><th>ratio</th></tr></thead><tbody>`;
  for (const fn of F) {
    const tr = msPerRun(() => Integrals.riemann(fn, N, "mid"));
    const tl = msPerRun(() => Integrals.lebesgue(fn, N, "mid"));
    const evL = fn.mCost > 1 ? `${N * fn.mCost} of f` : `${N} of m`;
    html += `<tr><td>${fn.label}</td><td>${N} of f</td><td>${evL}</td><td>${tr.toFixed(3)}</td><td>${tl.toFixed(3)}</td><td>${(tl / tr).toFixed(1)}</td></tr>`;
    await yieldToBrowser();
  }
  $("timeTable").innerHTML = html + `</tbody></table>`;
  $("timeStatus").textContent = "done";
  $("timeBtn").disabled = false;
}

function countTable() {
  const fn = fnByKey("sin");
  let html = `<table class="defs num-table"><thead><tr><th>M samples</th><th>counted Lebesgue (N = 1000 levels)</th><th>midpoint Riemann with the same M points</th></tr></thead><tbody>`;
  for (const M of [100, 1000, 10000, 100000]) {
    const c = Math.abs(Integrals.lebesgueCounted(fn, 1000, M) - fn.exact);
    const r = Math.abs(Integrals.riemann(fn, M, "mid") - fn.exact);
    html += `<tr><td>${M}</td><td>${c.toExponential(2)}</td><td>${r.toExponential(2)}</td></tr>`;
  }
  $("countTable").innerHTML = html + `</tbody></table><p class="hint">Absolute errors for sin x on [0, π].</p>`;
}

async function thomaeTable() {
  $("thomaeStatus").textContent = "computing…";
  $("thomaeBtn").disabled = true;
  let html = `<table class="defs num-table"><thead><tr><th>N</th><th>Riemann, right</th><th>Riemann, midpoint</th>` +
    `<th>upper Darboux</th><th>lower Darboux</th><th>Lebesgue</th><th>midpoints as doubles</th></tr></thead><tbody>`;
  for (const N of [10, 100, 1000, 10000]) {
    await yieldToBrowser();
    let fl = 0;
    for (let k = 0; k < N; k++) fl += Integrals.thomaeFloat((2 * k + 1) / (2 * N));
    html += `<tr><td>${N}</td><td>${Integrals.thomaeRiemann(N, "right").toExponential(3)}</td>` +
      `<td>${Integrals.thomaeRiemann(N, "mid").toExponential(3)}</td><td>${Integrals.thomaeUpper(N).toExponential(3)}</td>` +
      `<td>0</td><td class="best">0</td><td>${(fl / N).toExponential(3)}</td></tr>`;
  }
  $("thomaeTable").innerHTML = html + `</tbody></table>`;
  $("thomaeStatus").textContent = "done";
  $("thomaeBtn").disabled = false;
}

// ================================================================ Ex. 2

const METHODS2 = [
  ["Simpson, n = 64", (x) => { const p = NormCdf.cdfSimpson(x, 64); return { p, q: 1 - p }; }],
  ["Taylor series", (x) => { const p = NormCdf.cdfTaylor(x); return { p, q: 1 - p }; }],
  ["positive series", (x) => { const p = NormCdf.cdfSeries(x); return { p, q: 1 - p }; }],
  ["continued fraction", (x) => { if (x === 0) return { p: NaN, q: NaN }; const t = NormCdf.tailCF(x); return x > 0 ? { p: 1 - t, q: t } : { p: t, q: 1 - t }; }],
  ["A&S 26.2.17", (x) => { const p = NormCdf.cdfAS(x); return { p, q: 1 - p }; }],
  ["final method", (x) => NormCdf.normalCdf(x)],
];
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const refNum = (r) => ({ p: NormCdf.significant(r.p, 20).value, q: NormCdf.significant(r.q, 20).value });

// P(|Z| < k) from the 68-95-99.7 rule table on Wikipedia (15 decimals)
const WEB = [
  ["0.5", "0.382924922548026"], ["1", "0.682689492137086"], ["1.5", "0.866385597462284"], ["2", "0.954499736103642"],
  ["2.5", "0.987580669348448"], ["3", "0.997300203936740"], ["3.5", "0.999534741841929"], ["4", "0.999936657516334"],
  ["4.5", "0.999993204653751"], ["5", "0.999999426696856"], ["5.5", "0.999999962020875"], ["6", "0.999999998026825"],
  ["6.5", "0.999999999919680"], ["7", "0.999999999997440"], ["7.5", "0.999999999999936"], ["8", "0.999999999999999"],
];

function webTable() {
  const D = 120, S = 10n ** BigInt(D);
  let html = `<table class="defs num-table"><thead><tr><th>k</th><th>Wikipedia</th><th>reference, rounded to 15 decimals</th><th>reference, 20 decimals</th><th></th></tr></thead><tbody>`;
  let ok = 0;
  for (const [k, web] of WEB) {
    const r = NormCdf.reference(k, D);
    const inside = S - 2n * BigInt(r.q.replace(".", ""));
    const unit = 10n ** BigInt(D - 15);
    const rounded = "0." + ((inside + unit / 2n) / unit).toString().padStart(15, "0");
    const long = "0." + inside.toString().padStart(D, "0").slice(0, 20);
    const same = rounded === web;
    if (same) ok++;
    html += `<tr><td>${k}</td><td>${web}</td><td>${rounded}</td><td>${long}</td><td class="${same ? "best" : "bad"}">${same ? "same" : "different"}</td></tr>`;
  }
  $("webTable").innerHTML = html + `</tbody></table><p class="hint">${ok} of ${WEB.length} values identical. Source: Wikipedia, "68–95–99.7 rule", table of P(μ − kσ ≤ X ≤ μ + kσ).</p>`;
}

// reference digits written like Number.toPrecision: plain decimals down to 1e-6, exponent below
function refText(str, sig = 17) {
  const s = NormCdf.significant(str, sig).text;
  const [mant, e] = s.split("e"), exp = Number(e);
  if (exp < -6 || exp > 0) return s;
  const digits = mant.replace(".", "");
  return exp === 0 ? digits[0] + "." + digits.slice(1) : "0." + "0".repeat(-exp - 1) + digits;
}

const POINTS = ["-5", "-3", "-1.96", "-1", "0", "0.5", "1", "1.645", "1.96", "2", "2.576", "3", "4", "5", "6", "8", "10", "20"];
function pointsTable() {
  const rows = POINTS.map((xs) => ({ xs, r: NormCdf.reference(xs), v: NormCdf.normalCdf(Number(xs)) }));
  const table = (title, key) => {
    let html = `<table class="defs num-table"><thead><tr><th>x</th><th>${title}, reference</th><th>${title}, final method</th><th>rel. error</th></tr></thead><tbody>`;
    for (const { xs, r, v } of rows) {
      html += `<tr><td>${xs}</td><td>${refText(r[key])}</td><td>${v[key].toPrecision(17)}</td><td>${rel(v[key], refNum(r)[key]).toExponential(1)}</td></tr>`;
    }
    return html + `</tbody></table>`;
  };
  $("pointsTable").innerHTML = table("Φ(x)", "p") + table("1 − Φ(x)", "q") +
    `<p class="hint">Doubles printed with 17 significant digits, the reference truncated to 17. A relative error around 10<sup>−16</sup> is one unit in the last place.</p>`;
}

function calc() {
  const xs = $("calcX").value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(xs) || Math.abs(Number(xs)) > 37) {
    $("calcOut").innerHTML = `<p class="hint">Enter a decimal number between −37 and 37.</p>`;
    return;
  }
  const x = Number(xs), r = NormCdf.reference(xs), R = refNum(r);
  const terms = {
    "Taylor series": () => { const s = {}; NormCdf.cdfTaylor(x, s); return s.terms; },
    "positive series": () => { const s = {}; NormCdf.seriesSum(Math.abs(x), s); return s.terms; },
    "continued fraction": () => { if (x === 0) return "–"; const s = {}; NormCdf.cfDenominator(Math.abs(x), s); return s.terms; },
    "Simpson, n = 64": () => "65 exp",
  };
  let html = `<table class="defs num-table"><thead><tr><th>method</th><th>Φ(x)</th><th>rel. error</th><th>1 − Φ(x)</th><th>rel. error</th><th>terms</th></tr></thead><tbody>` +
    `<tr><td>reference</td><td>${refText(r.p)}</td><td></td><td>${refText(r.q)}</td><td></td><td></td></tr>`;
  for (const [name, m] of METHODS2) {
    const v = m(x);
    html += `<tr><td>${name}</td><td>${v.p.toPrecision(17)}</td><td>${rel(v.p, R.p).toExponential(1)}</td><td>${v.q.toPrecision(17)}</td>` +
      `<td>${rel(v.q, R.q).toExponential(1)}</td><td>${terms[name] ? terms[name]() : ""}</td></tr>`;
  }
  $("calcOut").innerHTML = html + `</tbody></table>`;
}

// ---------------------------------------------------------------- accuracy over a grid

let grid = null;
async function computeGrid() {
  if (grid) return grid;
  grid = [];
  for (let i = -160; i <= 160; i++) {
    const xs = (i / 20).toFixed(2);
    grid.push({ x: Number(xs), ...refNum(NormCdf.reference(xs)) });
    if (i % 40 === 0) { $("accStatus").textContent = `reference values… ${i + 160}/320`; await yieldToBrowser(); }
  }
  return grid;
}

function errorsOn(g, m) {
  let abs = 0, absAt = 0, relT = 0, relAt = 0;
  const pts = [];
  for (const { x, p, q } of g) {
    const v = m(x);
    if (!Number.isFinite(v.p)) continue;
    const e = x >= 0 ? rel(v.q, q) : rel(v.p, p);
    const a = Math.abs(v.p - p);
    if (a > abs) { abs = a; absAt = x; }
    if (e > relT) { relT = e; relAt = x; }
    pts.push([x, e]);
  }
  return { abs, absAt, rel: relT, relAt, pts };
}

async function accuracy() {
  $("accBtn").disabled = true;
  const g = await computeGrid();
  $("accStatus").textContent = "errors…";
  await yieldToBrowser();
  const box = $("accCharts");
  box.innerHTML = METHODS2.map((m, i) => `<div><div class="chart-title">${m[0]}</div><div class="chart" id="acc${i}"></div></div>`).join("");
  let html = `<table class="defs num-table"><thead><tr><th>method</th><th>max abs. error on Φ</th><th>at x</th><th>max rel. error on the tail</th><th>at x</th></tr></thead><tbody>`;
  METHODS2.forEach(([name, m], i) => {
    const r = errorsOn(g, m);
    const pl = new Plot($("acc" + i), 170).begin({ min: -8, max: 8 }, { min: 1e-17, max: 1e3, log: true }, { l: 40, r: 10, t: 8, b: 26 });
    pl.axes([-8, -4, 0, 4, 8], [1e-16, 1e-12, 1e-8, 1e-4, 1], String, pow10Fmt);
    pl.line([[-8, 1.1e-16], [8, 1.1e-16]], css("--muted"), 1, [4, 4]);
    const pts = r.pts.map(([x, e]) => [x, Math.min(1e3, Math.max(1e-17, e))]);
    pl.line(pts, css("--s2"), 2);
    pl.hover = (px) => {
      const x = pl.invX(px);
      const best = r.pts.reduce((a, b) => (Math.abs(b[0] - x) < Math.abs(a[0] - x) ? b : a));
      return `x = ${best[0]}\nrel. error ${best[1].toExponential(2)}`;
    };
    html += `<tr><td>${name}</td><td>${r.abs.toExponential(2)}</td><td>${r.absAt}</td><td>${r.rel.toExponential(2)}</td><td>${r.relAt}</td></tr>`;
  });
  $("accTable").innerHTML = html + `</tbody></table><p class="hint">Grid x = −8 to 8, step 0.05. Errors that are exactly zero are drawn at 10<sup>−17</sup>, errors above 10<sup>3</sup> at 10<sup>3</sup>. The continued fraction is skipped at x = 0.</p>`;
  switchTable(g);
  $("accStatus").textContent = "done";
  $("accBtn").disabled = false;
}

function randomPoints(n) {
  const xs = new Float64Array(n);
  let seed = 12345;
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; xs[i] = (seed / 2147483648) * 12 - 6; }
  return xs;
}

function nsPerCall(f, xs) {
  let s = 0;
  for (let i = 0; i < 2000; i++) s += f(xs[i]);   // warm-up
  const t0 = performance.now();
  for (let i = 0; i < xs.length; i++) s += f(xs[i]);
  return ((performance.now() - t0) * 1e6) / xs.length + (s === -1 ? 1 : 0);
}

function switchTable(g) {
  const xs = randomPoints(200000);
  let html = `<table class="defs num-table"><thead><tr><th>switch at |x| =</th><th>max rel. error on the tail</th><th>max abs. error on Φ</th><th>ns per value</th></tr></thead><tbody>`;
  for (const sw of [1.5, 2, 2.5, 3, 3.5]) {
    const r = errorsOn(g, (x) => NormCdf.normalCdf(x, sw));
    const ns = nsPerCall((x) => NormCdf.normalCdf(x, sw).p, xs);
    html += `<tr><td${sw === NormCdf.SWITCH ? ' class="best"' : ""}>${sw}${sw === NormCdf.SWITCH ? " (used)" : ""}</td><td>${r.rel.toExponential(2)}</td><td>${r.abs.toExponential(2)}</td><td>${ns.toFixed(0)}</td></tr>`;
  }
  $("switchTable").innerHTML = html + `</tbody></table><p class="hint">Errors on the same grid as the charts; times measured in this browser on 200 000 random points in [−6, 6].</p>`;
}

function termsTable() {
  const xs = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const row = (label, f) => `<tr><td>${label}</td>` + xs.map((x) => `<td>${f(x)}</td>`).join("") + `</tr>`;
  const t = (fn) => (x) => { const s = {}; fn(x, s); return s.terms; };
  $("termsTable").innerHTML = `<table class="defs num-table"><thead><tr><th>x</th>${xs.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>` +
    row("Taylor series", t(NormCdf.cdfTaylor)) + row("positive series", t(NormCdf.seriesSum)) + row("continued fraction", t(NormCdf.cfDenominator)) +
    `</tbody></table>`;
}

async function speed() {
  $("speedBtn").disabled = true;
  $("speedStatus").textContent = "measuring…";
  await yieldToBrowser();
  const xs = randomPoints(200000);
  let html = `<table class="defs num-table"><thead><tr><th>method</th><th>ns per value</th></tr></thead><tbody>`;
  for (const [name, m] of METHODS2) {
    const f = name === "final method" ? (x) => NormCdf.normalCdf(x).p : (x) => m(x).p;
    html += `<tr><td>${name}</td><td>${nsPerCall(f, xs).toFixed(0)}</td></tr>`;
    await yieldToBrowser();
  }
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) NormCdf.reference("1.234");
  html += `<tr><td>BigInt reference</td><td>${(((performance.now() - t0) / 20) * 1e6).toFixed(0)}</td></tr>`;
  $("speedTable").innerHTML = html + `</tbody></table><p class="hint">200 000 random points in [−6, 6]; the reference is timed at x = 1.234.</p>`;
  $("speedStatus").textContent = "done";
  $("speedBtn").disabled = false;
}

// ================================================================ start

function segInit(el, onChange) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
}

async function start() {
  fillFnSelect($("picFn"), "sin");
  fillFnSelect($("convFn"), "invsqrt");
  $("picFn").addEventListener("change", drawPicture);
  $("picN").addEventListener("change", drawPicture);
  segInit($("picMode"), (v) => { picMode = v; drawPicture(); });
  $("convFn").addEventListener("change", drawConvergence);
  $("timeBtn").addEventListener("click", timeTable);
  $("thomaeBtn").addEventListener("click", thomaeTable);
  $("calcBtn").addEventListener("click", calc);
  $("calcX").addEventListener("keydown", (e) => { if (e.key === "Enter") calc(); });
  $("accBtn").addEventListener("click", accuracy);
  $("speedBtn").addEventListener("click", speed);

  fnTable();
  drawPicture();
  computeConvergence();
  errTable();
  drawConvergence();
  countTable();
  webTable();
  pointsTable();
  calc();
  termsTable();
  window.addEventListener("resize", () => { drawPicture(); drawConvergence(); });

  await yieldToBrowser();
  await thomaeTable();
  await accuracy();
  await timeTable();
  await speed();
}

start();
