// Compares two bench runs (base vs PR), renders every ms* metric, gates on one.
//   node compare.mjs <base.json> <pr.json> <gateMetric> [thresholdPct=25] [title]
import fs from "node:fs";

const [baseFile, prFile, gateKey, thresholdArg, title] = process.argv.slice(2);
if (!baseFile || !prFile || !gateKey) {
  console.error("Usage: compare.mjs <base.json> <pr.json> <gateMetric> [thresholdPct=25] [title]");
  process.exit(1);
}
const threshold = thresholdArg === undefined ? 25 : Number(thresholdArg);
if (!Number.isFinite(threshold) || threshold < 0) {
  console.error(`Invalid threshold: ${thresholdArg}`);
  process.exit(1);
}

function readMetrics(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Could not read benchmark metrics from ${file}: ${error.message}`);
    process.exit(1);
  }
}

const base = readMetrics(baseFile);
const pr = readMetrics(prFile);

const keys = Object.keys(base).filter(
  (k) => k.startsWith("ms") && Number.isFinite(base[k]) && Number.isFinite(pr[k]),
);
if (!keys.includes(gateKey)) {
  console.error(`Gate metric "${gateKey}" missing or non-numeric in the bench output`);
  process.exit(1);
}

const pct = (k) => ((pr[k] - base[k]) / base[k]) * 100;
const fmt = (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
const canGate = base[gateKey] > 0;
const gateDelta = canGate ? pct(gateKey) : 0;
const emoji = !canGate ? "⚪️" : gateDelta >= threshold ? "🔴" : gateDelta < -10 ? "🟢" : "⚪️";

const rows = keys.map((k) => {
  const delta = base[k] > 0 ? fmt(pct(k)) : "n/a";
  return `| ${k}${k === gateKey ? " (gate)" : ""} | ${base[k]} | ${pr[k]} | ${delta} |`;
});

const verdict = !canGate
  ? `\`${gateKey}\` baseline is 0; nothing to gate on.`
  : gateDelta >= threshold
    ? `⚠️ **\`${gateKey}\` ${fmt(gateDelta)} vs base** (threshold ${threshold}%). Same-runner comparison, so this is a real regression.`
    : gateDelta < -10
      ? `\`${gateKey}\` ${fmt(gateDelta)} vs base. 🎉`
      : `\`${gateKey}\` ${fmt(gateDelta)} vs base — within noise.`;

const summary = [
  `### ${emoji} ${title ?? "performance"}`,
  "",
  "| metric | base | PR | Δ |",
  "| --- | --- | --- | --- |",
  ...rows,
  "",
  verdict,
].join("\n");

console.log(summary);
const out = process.env.GITHUB_STEP_SUMMARY;
if (out) fs.appendFileSync(out, summary + "\n");

if (canGate && gateDelta >= threshold) {
  console.error(`\nRegression ${fmt(gateDelta)} exceeds threshold ${threshold}%`);
  process.exit(1);
}
