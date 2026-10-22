"use strict";

// Same simulation the page runs (same seeds, same parameters), printed as tables.
// usage: node tools/experiments.js [m] [p]

const Sim = require("../sim.js");

const m = parseInt(process.argv[2] || "2000", 10);
const p = parseFloat(process.argv[3] || "0.3");
const CHECKPOINTS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const SEEDS = { bernoulli: 11, rademacher: 22 };

for (const model of ["bernoulli", "rademacher"]) {
  const t0 = Date.now();
  const run = Sim.simulate({ model, p, m, checkpoints: CHECKPOINTS, seed: SEEDS[model] });
  const { mu, sigma2 } = Sim.moments(model, p);
  console.log(`\n=== ${model}${model === "bernoulli" ? ` p=${p}` : ""}, m=${m} attackers, ${Date.now() - t0} ms ===`);
  console.log("      n |  mean S_n  var S_n (th) |  mean S/n  var S/n  (theory)  | var S/sqrt(n) (th) | P(|S/n-mu|>0.05) sim  exact  Cheb | KS(Z) ");
  CHECKPOINTS.forEach((n, c) => {
    const S = run.S[c];
    const avg = Sim.scaled(S, 1 / n);
    const nor = Sim.scaled(S, 1 / Math.sqrt(n));
    // standardised version: (S_n - n mu) / sqrt(n sigma^2)
    const z = Float64Array.from(S, (s) => (s - n * mu) / Math.sqrt(n * sigma2));
    console.log(
      String(n).padStart(7) + " | " +
      Sim.mean(S).toFixed(2).padStart(9) + " " + Sim.variance(S).toFixed(1).padStart(8) + " (" + (n * sigma2).toFixed(1) + ") | " +
      Sim.mean(avg).toFixed(4).padStart(8) + " " + Sim.variance(avg).toExponential(2).padStart(9) + " (" + (sigma2 / n).toExponential(2) + ") | " +
      Sim.variance(nor).toFixed(4).padStart(7) + " (" + sigma2.toFixed(4) + ") | " +
      Sim.tailFraction(S, n, mu, 0.05).toFixed(4).padStart(7) + " " + Sim.exactTail(model, p, n, 0.05).toFixed(4).padStart(7) + " " + Math.min(1, sigma2 / (n * 0.0025)).toFixed(4).padStart(7) + " | " +
      Sim.ksNormal(z).toFixed(4)
    );
  });
}

// several attackers on the same n systems: share of systems hit by at least one
console.log("\n=== systems penetrated by at least one attacker (Bernoulli, n = 1000) ===");
for (const mm of [1, 2, 3, 5, 10, 20]) {
  const run = Sim.simulate({ model: "bernoulli", p, m: mm, checkpoints: [1000], seed: 33 });
  let hit = 0;
  for (const h of run.hitBy) if (h > 0) hit++;
  console.log(`m=${String(mm).padStart(2)}  simulated ${(hit / 1000).toFixed(3)}  theory 1-(1-p)^m = ${(1 - (1 - p) ** mm).toFixed(3)}`);
}
