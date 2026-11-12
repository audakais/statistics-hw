"use strict";

// Page logic: builds every table and chart from the records, nothing is typed in by hand.

const VARS = ["Gender", "Admit", "Dept"];
const UCB = parseCSV(UCB_CSV);
const RECORDS = shuffle(expand(UCB.rows, "Freq", VARS), rng(1973));

const pct = (v, d = 1) => (100 * v).toFixed(d) + "%";
function pfmt(p) {
  if (p === 0) return "< 1e-300";
  if (p < 1e-4) return p.toExponential(2);
  return p.toFixed(4);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// table with a header row, body rows and an optional footer row; cells are already formatted strings
function tableHTML(head, body, foot) {
  const tr = (cells, tag) => "<tr>" + cells.map((c) => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
  return `<div class="table-wrap"><table class="defs num-table"><thead>${tr(head, "th")}</thead><tbody>` +
    body.map((r) => tr(r, "td")).join("") + (foot ? tr(foot, "td") : "") + "</tbody></table></div>";
}

function segment(el, onChange) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    onChange(b.dataset.v);
  });
  return () => el.querySelector("button.on").dataset.v;
}

// ---------------------------------------------------------------- 01 data

function renderSource() {
  $("srcTable").innerHTML = tableHTML(
    ["line", "Dept", "Gender", "Admit", "Freq"],
    UCB.rows.map((r) => [r.rownames, r.Dept, r.Gender, r.Admit, r.Freq]));
  $("recCount").textContent = RECORDS.length;
  $("recTable").innerHTML = tableHTML(
    ["#", "Gender", "Admit", "Dept"],
    RECORDS.slice(0, 10).map((r, i) => [i + 1, r.Gender, r.Admit, r.Dept]));
}

const state = { x: "Gender", y: "Admit", z: "all" };

function fillVarSelects() {
  for (const [id, key] of [["selX", "x"], ["selY", "y"]]) {
    $(id).innerHTML = VARS.map((v) => `<option${v === state[key] ? " selected" : ""}>${v}</option>`).join("");
    $(id).addEventListener("change", (e) => { state[key] = e.target.value; update(); });
  }
  $("selZ").innerHTML = '<option value="all">all departments</option>' +
    [...new Set(RECORDS.map((r) => r.Dept))].sort().map((d) => `<option value="${d}">only ${d}</option>`).join("");
  $("selZ").addEventListener("change", (e) => { state.z = e.target.value; update(); });
}

function currentRecords() {
  return state.z === "all" ? RECORDS : RECORDS.filter((r) => r.Dept === state.z);
}

// ---------------------------------------------------------------- 02 contingency table and frequencies

let ctView = () => "counts";
let expView = () => "E";

function contingencyHTML(t, a, view) {
  const head = [esc(t.xKey) + " \\ " + esc(t.yKey), ...t.cols.map(esc)];
  const f4 = (v) => v.toFixed(4);
  let body, foot;
  if (view === "counts") {
    head.push("total");
    body = t.rows.map((x, i) => [esc(x), ...t.n[i], t.r[i]]);
    foot = ["total", ...t.c, t.N];
  } else if (view === "joint") {
    head.push("f<sub>i·</sub>");
    body = t.rows.map((x, i) => [esc(x), ...a.joint[i].map(f4), f4(a.fRow[i])]);
    foot = ["f<sub>·j</sub>", ...a.fCol.map(f4), f4(1)];
  } else if (view === "row") {
    head.push("total");
    body = t.rows.map((x, i) => [esc(x), ...a.rowProf[i].map((v) => pct(v)), pct(1)]);
    foot = ["all (f<sub>·j</sub>)", ...a.fCol.map((v) => pct(v)), pct(1)];
  } else {
    head.push("all (f<sub>i·</sub>)");
    body = t.rows.map((x, i) => [esc(x), ...a.colProf[i].map((v) => pct(v)), pct(a.fRow[i])]);
    foot = ["total", ...t.c.map(() => pct(1)), pct(1)];
  }
  return tableHTML(head, body, foot);
}

// one small panel per row category: bars are f(y | x), the dashed marks are the marginal f(y)
function renderProfiles(t, a) {
  const box = $("profCharts");
  box.innerHTML = "";
  const J = t.cols.length;
  box.style.gridTemplateColumns = `repeat(${Math.min(t.rows.length, 3)}, minmax(0, 1fr))`;
  t.rows.forEach((x, i) => {
    const cell = document.createElement("div");
    cell.innerHTML = `<div class="chart-title">${esc(t.xKey)} = ${esc(x)}, n = ${t.r[i]}</div><div class="chart"></div>`;
    box.appendChild(cell);
    const p = new Plot(cell.querySelector(".chart"), 170);
    const ymax = Math.max(...a.rowProf.flat(), ...a.fCol) * 1.1;
    p.begin({ min: 0, max: J }, { min: 0, max: ymax }, { l: 40, r: 10, t: 8, b: 24 });
    p.axes(t.cols.map((_, j) => j + 0.5), niceTicks(0, ymax, 4), (v) => t.cols[Math.floor(v)], (v) => Math.round(v * 100) + "%");
    p.bars(t.cols.map((_, j) => ({ x0: j + 0.18, x1: j + 0.82, y: a.rowProf[i][j] })), css("--s1"));
    for (let j = 0; j < J; j++) p.line([[j + 0.08, a.fCol[j]], [j + 0.92, a.fCol[j]]], css("--s2"), 2, [4, 3]);
    p.hover = (px) => {
      const j = Math.floor(p.invX(px));
      if (j < 0 || j >= J) return null;
      return `${t.yKey} = ${t.cols[j]}\nf(${t.cols[j]} | ${x}) = ${pct(a.rowProf[i][j])}\nf(${t.cols[j]}) overall = ${pct(a.fCol[j])}\ncount ${t.n[i][j]} of ${t.r[i]}`;
    };
  });
  legend($("profLegend"), [["conditional f(y | x)", css("--s1")], ["marginal f(y), what independence predicts", css("--s2"), "dash"]]);
}

// ---------------------------------------------------------------- 03 expected frequencies

function expectedHTML(t, a, view) {
  const head = [esc(t.xKey) + " \\ " + esc(t.yKey), ...t.cols.map(esc)];
  const sig = (v) => (Math.abs(v) > 1.96 ? `<span class="flag">${v.toFixed(2)}</span>` : v.toFixed(2));
  const cellFmt = {
    E: (i, j) => a.E[i][j].toFixed(2),
    D: (i, j) => (t.n[i][j] - a.E[i][j] >= 0 ? "+" : "") + (t.n[i][j] - a.E[i][j]).toFixed(2),
    R: (i, j) => sig(a.adj[i][j]),
    C: (i, j) => a.contrib[i][j].toFixed(3),
  }[view];
  const body = t.rows.map((x, i) => [esc(x), ...t.cols.map((_, j) => cellFmt(i, j))]);
  let foot = null;
  if (view === "E") { head.push("total"); body.forEach((r, i) => r.push(t.r[i])); foot = ["total", ...t.c, t.N]; }
  if (view === "C") { head.push("row sum"); body.forEach((r, i) => r.push(a.contrib[i].reduce((s, v) => s + v, 0).toFixed(3))); foot = ["χ²", ...t.cols.map(() => ""), a.chi2.toFixed(3)]; }
  return tableHTML(head, body, foot);
}

// ---------------------------------------------------------------- 04 chi-square and p-value

function renderTest(t, a) {
  const I = t.rows.length, J = t.cols.length;
  const lines = [
    `table             ${I} × ${J},  N = ${t.N}`,
    `chi-square        χ² = Σ (O − E)² / E = ${a.chi2.toFixed(4)}`,
    `degrees of freedom (I − 1)(J − 1) = ${a.df}`,
    `p-value           P(χ²_${a.df} ≥ ${a.chi2.toFixed(4)}) = ${pfmt(a.p)}`,
    `likelihood ratio  G² = 2 Σ O ln(O/E) = ${a.G2.toFixed(4)},  p = ${pfmt(a.pG2)}`,
  ];
  if (a.yates !== undefined) {
    lines.push(`Yates corrected   χ² = ${a.yates.toFixed(4)},  p = ${pfmt(a.pYates)}`);
    lines.push(`odds ratio        (${t.n[0][0]}·${t.n[1][1]}) / (${t.n[0][1]}·${t.n[1][0]}) = ${a.oddsRatio.toFixed(4)}`);
  }
  lines.push(`Cramér's V        √(χ² / (N·min(I−1, J−1))) = ${a.V.toFixed(4)}`);
  lines.push(`smallest E        ${a.minE.toFixed(2)}  (${a.small} cell${a.small === 1 ? "" : "s"} below 5)`);
  $("testOut").textContent = lines.join("\n");
  const dep = a.p < 0.05;
  $("verdict").className = "data-block " + (dep ? "bad" : "good");
  $("verdict").textContent = dep
    ? `p = ${pfmt(a.p)} < 0.05: the observed table is too far from the independence table to be sampling noise. Reject H0, ${t.xKey} and ${t.yKey} are associated${state.z === "all" ? "" : " in department " + state.z}.`
    : `p = ${pfmt(a.p)} ≥ 0.05: a deviation this size is common when H0 is true. The data give no evidence of association between ${t.xKey} and ${t.yKey}${state.z === "all" ? "" : " in department " + state.z} (which is not a proof of independence).`;
  if (a.small > 0) $("verdict").textContent += ` Warning: ${a.small} expected count${a.small === 1 ? " is" : "s are"} below 5, so the chi-square approximation is rough; the permutation p-value below does not rely on it.`;
}

function runPermutation() {
  const recs = currentRecords();
  const t = crosstab(recs, state.x, state.y);
  if (t.rows.length < 2 || t.cols.length < 2) return;
  const B = Number($("permB").value);
  const t0 = performance.now();
  const res = permutationTest(recs, state.x, state.y, B, 7);
  const ms = performance.now() - t0;
  const a = analyse(t);
  $("permOut").textContent =
    `${B} shuffles of the ${t.yKey} column (seed 7), ${ms.toFixed(0)} ms\n` +
    `shuffled tables with χ² ≥ ${res.obs.toFixed(3)}: ${res.hits}\n` +
    `permutation p-value (hits + 1)/(B + 1) = ${res.p < 1e-3 ? res.p.toExponential(2) : res.p.toFixed(4)}` +
    (res.hits === 0 ? `\n(no shuffle reached the observed value, so this only says that p is below about 1/(B + 1))` : "") +
    `\nchi-square approximation p = ${pfmt(a.p)}`;
  drawPermutation(res, a.df);
}

function drawPermutation(res, df) {
  const sims = Float64Array.from(res.sims).sort();
  const q = sims[Math.floor(0.999 * (sims.length - 1))];
  const offScale = res.obs > 1.3 * q;
  const xmax = (offScale ? q : Math.max(q, res.obs)) * 1.08;
  const bins = 40, w = xmax / bins, cnt = new Array(bins).fill(0);
  for (const s of sims) if (s < xmax) cnt[Math.floor(s / w)]++;
  const expCnt = cnt.map((_, k) => res.B * (chi2Sf(k * w, df) - chi2Sf((k + 1) * w, df)));
  const ymax = Math.max(...cnt, ...expCnt.slice(1)) * 1.1;
  const p = new Plot($("permChart"), 240);
  p.begin({ min: 0, max: xmax }, { min: 0, max: ymax });
  p.axes(niceTicks(0, xmax, 6), niceTicks(0, ymax, 4), (v) => fmt(v, 1), (v) => fmt(v, 0), "χ² of the shuffled table");
  p.bars(cnt.map((c, k) => ({ x0: k * w, x1: (k + 1) * w, y: c })), css("--s1"));
  p.line(expCnt.map((c, k) => [(k + 0.5) * w, c]).slice(df === 1 ? 1 : 0), css("--s2"), 2);
  const ctx = p.ctx;
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.fillStyle = css("--paper");
  if (offScale) {
    ctx.textAlign = "right";
    ctx.fillText(`observed χ² = ${res.obs.toFixed(1)}, off the scale →`, p.w - p.pad.r - 4, p.pad.t + 14);
  } else {
    p.line([[res.obs, 0], [res.obs, ymax]], css("--s3"), 2);
    ctx.textAlign = res.obs > xmax / 2 ? "right" : "left";
    ctx.fillText(` observed ${res.obs.toFixed(2)} `, p.X(res.obs), p.pad.t + 14);
  }
  p.hover = (px) => {
    const k = Math.floor(p.invX(px) / w);
    if (k < 0 || k >= bins) return null;
    return `χ² in [${(k * w).toFixed(2)}, ${((k + 1) * w).toFixed(2)})\nshuffled tables: ${cnt[k]}\nχ²_${df} predicts: ${expCnt[k].toFixed(1)}`;
  };
  const items = [["shuffled tables", css("--s1")], [`χ² with ${df} df, expected count per bin`, css("--s2")]];
  if (!offScale) items.push(["observed χ²", css("--s3")]);
  legend($("permLegend"), items);
}

// ---------------------------------------------------------------- 06 department by department

function renderStrata() {
  const strata = stratify(RECORDS, "Dept", "Gender", "Admit");
  const pooled = crosstab(RECORDS, "Gender", "Admit");
  const rate = (t, g) => t.n[t.rows.indexOf(g)][t.cols.indexOf("Admitted")] / t.r[t.rows.indexOf(g)];
  const appl = (t, g) => t.r[t.rows.indexOf(g)];
  const row = (label, t) => {
    const a = analyse(t);
    return [label, appl(t, "Female"), pct(rate(t, "Female")), appl(t, "Male"), pct(rate(t, "Male")),
      a.chi2.toFixed(3), a.p < 0.05 ? `<span class="flag">${pfmt(a.p)}</span>` : pfmt(a.p), a.oddsRatio.toFixed(3)];
  };
  let sum = 0;
  const body = strata.map(({ z, t }) => { sum += analyse(t).chi2; return row(z, t); });
  body.push(row("all, pooled", pooled));
  $("strataTable").innerHTML = tableHTML(
    ["Dept", "women", "admitted", "men", "admitted", "χ²", "p", "odds ratio W/M"], body,
    ["sum A–F", "", "", "", "", sum.toFixed(3), pfmt(chi2Sf(sum, strata.length)) + ` (df ${strata.length})`, ""]);

  // admission rate of women and men, per department and pooled
  const cats = [...strata.map((s) => s.z), "all"];
  const tabs = [...strata.map((s) => s.t), pooled];
  const p = new Plot($("strataChart"), 260);
  p.begin({ min: 0, max: cats.length }, { min: 0, max: 1 });
  p.axes(cats.map((_, k) => k + 0.5), [0, 0.2, 0.4, 0.6, 0.8, 1], (v) => cats[Math.floor(v)], (v) => Math.round(v * 100) + "%", "department");
  tabs.forEach((t, k) => p.line([[k + 0.5, rate(t, "Female")], [k + 0.5, rate(t, "Male")]], css("--muted"), 1));
  p.line([[cats.length - 1, 0], [cats.length - 1, 1]], css("--border"), 1, [3, 3]);
  // marker area grows with the number of applicants, so the weight of each department is visible
  const maxN = Math.max(...strata.flatMap((s) => [appl(s.t, "Female"), appl(s.t, "Male")]));
  tabs.forEach((t, k) => {
    for (const [g, col] of [["Male", css("--s1")], ["Female", css("--s2")]]) {
      const r = k === cats.length - 1 ? 7 : 4 + 9 * Math.sqrt(appl(t, g) / maxN);
      p.dots([[k + 0.5, rate(t, g)]], col, r);
    }
  });
  p.hover = (px) => {
    const k = Math.floor(p.invX(px));
    if (k < 0 || k >= cats.length) return null;
    const t = tabs[k];
    return `${k === cats.length - 1 ? "all departments" : "department " + cats[k]}\nwomen: ${pct(rate(t, "Female"))} of ${appl(t, "Female")}\nmen:   ${pct(rate(t, "Male"))} of ${appl(t, "Male")}`;
  };
  legend($("strataLegend"), [["men", css("--s1")], ["women", css("--s2")]]);
}

// ---------------------------------------------------------------- main view

function update() {
  const recs = currentRecords();
  const t = crosstab(recs, state.x, state.y);
  const bad = t.rows.length < 2 || t.cols.length < 2 || state.x === state.y;
  $("ctWarn").style.display = bad ? "block" : "none";
  for (const id of ["ctTable", "profCharts", "expTable", "testOut", "verdict"]) $(id).style.visibility = bad ? "hidden" : "visible";
  if (bad) {
    $("ctWarn").textContent = state.x === state.y
      ? "Choose two different variables."
      : "One of the variables takes a single value in this subset, so there is nothing to compare. Choose other variables or all departments.";
    return;
  }
  const a = analyse(t);
  $("ctTitle").textContent = `${t.xKey} × ${t.yKey}, ${state.z === "all" ? "all departments" : "department " + state.z}, N = ${t.N}`;
  $("ctTable").innerHTML = contingencyHTML(t, a, ctView());
  renderProfiles(t, a);
  $("expTable").innerHTML = expectedHTML(t, a, expView());
  renderTest(t, a);
  runPermutation();
}

// ---------------------------------------------------------------- 08 any dataset

function ownColumns() {
  try {
    const { header } = parseCSV($("ownCsv").value);
    const opts = (sel) => header.map((h) => `<option${h === sel ? " selected" : ""}>${esc(h)}</option>`).join("");
    const keep = (id, fallback) => (header.includes($(id).value) ? $(id).value : fallback);
    const x = keep("ownX", header.includes("Gender") ? "Gender" : header[0]);
    const y = keep("ownY", header.includes("Admit") ? "Admit" : header[1]);
    const guessF = header.includes("Freq") ? "Freq" : "";
    const f = $("ownF").options.length === 0 ? guessF : $("ownF").value === "" ? "" : keep("ownF", guessF);
    $("ownX").innerHTML = opts(x);
    $("ownY").innerHTML = opts(y);
    $("ownF").innerHTML = `<option value=""${f === "" ? " selected" : ""}>none (one line per unit)</option>` + opts(f);
  } catch (e) { /* the analysis reports the error */ }
}

function ownAnalyse() {
  const out = $("ownOut");
  try {
    const { rows } = parseCSV($("ownCsv").value);
    const x = $("ownX").value, y = $("ownY").value, f = $("ownF").value;
    if (x === y) throw new Error("choose two different columns");
    const recs = f ? expand(rows, f, [x, y]) : rows;
    const t = crosstab(recs, x, y);
    if (t.rows.length < 2 || t.cols.length < 2) throw new Error("each variable needs at least two categories");
    const a = analyse(t);
    const summary = `N = ${t.N}, ${t.rows.length} × ${t.cols.length} table\n` +
      `χ² = ${a.chi2.toFixed(4)}, df = ${a.df}, p = ${pfmt(a.p)}\n` +
      `Cramér's V = ${a.V.toFixed(4)}, smallest expected count ${a.minE.toFixed(2)}` +
      (a.small ? ` (${a.small} below 5: the approximation is rough)` : "") +
      `\n${a.p < 0.05 ? "reject independence at the 5% level" : "no evidence against independence at the 5% level"}`;
    out.innerHTML = `<div class="chart-title">observed counts</div>${contingencyHTML(t, a, "counts")}` +
      `<div class="chart-title">conditional frequencies f(${esc(y)} | ${esc(x)})</div>${contingencyHTML(t, a, "row")}` +
      `<div class="chart-title">expected counts under independence</div>${expectedHTML(t, a, "E")}` +
      `<div class="data-block mono small">${esc(summary)}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="data-block bad mono small">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------- start

renderSource();
fillVarSelects();
ctView = segment($("ctView"), update);
expView = segment($("expView"), update);
$("permRun").addEventListener("click", runPermutation);
$("permB").addEventListener("change", runPermutation);
update();
renderStrata();
$("ownCsv").value = UCB_CSV.trim();
$("ownCsv").addEventListener("input", ownColumns);
$("ownGo").addEventListener("click", ownAnalyse);
ownColumns();
ownAnalyse();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { update(); renderStrata(); }, 150);
});
