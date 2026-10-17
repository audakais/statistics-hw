"use strict";

// Runs the Caesar key-recovery experiment and the ECC timing numbers from the
// command line, with the same code and the same seed the page uses.
// usage: node tools/experiments.js

const Caesar = require("../caesar.js");
const ECC = require("../ecc.js");
const STATS = require("../corpus-stats.js");
const TEST_TEXT = require("../test-text.js");

const model = Caesar.makeModel(STATS);
const lengths = [3, 5, 8, 10, 15, 20, 30, 50, 100, 200, 500];

function printTable(title, rows) {
  console.log("\n" + title);
  console.log("letters  " + Caesar.METHODS.map((m) => m.id.padStart(11)).join(""));
  for (const r of rows) {
    console.log(
      String(r.length).padStart(7) + "  " +
      Caesar.METHODS.map((m) => (100 * r.accuracy[m.id]).toFixed(1).padStart(10) + "%").join("")
    );
  }
}

printTable("with spaces and punctuation (1000 trials per length)",
  Caesar.runExperiment(model, TEST_TEXT, { lengths, trials: 1000, seed: 2024 }));
printTable("letters only, spaces removed (1000 trials per length)",
  Caesar.runExperiment(model, TEST_TEXT, { lengths, trials: 1000, seed: 2024, stripSpaces: true }));

const b = ECC.benchmarkAdd(20000);
console.log(`\nsecp256k1 additions/s: affine ${b.affine.toFixed(0)}, jacobian ${b.jacobian.toFixed(0)}`);
