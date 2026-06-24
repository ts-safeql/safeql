/**
 * Compares two bench.mts runs and prints a markdown summary. Gates on the
 * distinct (uncached) metric, since that is the path most prone to regression.
 *   node compare.mjs base.json pr.json [thresholdPct=25]
 */
import fs from "node:fs";

const [baseFile, prFile, thresholdArg] = process.argv.slice(2);
if (!baseFile || !prFile) {
  console.error("Usage: compare.mjs <base.json> <pr.json> [thresholdPct=25]");
  process.exit(1);
}
const threshold = thresholdArg === undefined ? 25 : Number(thresholdArg);
if (!Number.isFinite(threshold) || threshold < 0) {
  console.error(`Invalid threshold: ${thresholdArg}`);
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const pr = JSON.parse(fs.readFileSync(prFile, "utf8"));

const METRICS = ["msPerQueryDistinct", "msPerQueryRepeated"];
for (const [file, metrics] of [
  [baseFile, base],
  [prFile, pr],
]) {
  const invalid = METRICS.find((k) => !Number.isFinite(metrics?.[k]) || metrics[k] <= 0);
  if (invalid !== undefined) {
    console.error(`Invalid or missing ${invalid} in ${file}`);
    process.exit(1);
  }
}

const delta = (k) => ((pr[k] - base[k]) / base[k]) * 100;
const fmt = (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
const distinctDelta = delta("msPerQueryDistinct");
const repeatedDelta = delta("msPerQueryRepeated");

const emoji = distinctDelta >= threshold ? "🔴" : distinctDelta < -10 ? "🟢" : "⚪️";

const lines = [
  `### ${emoji} generate() performance (${pr.schemaTables}+ table schema)`,
  "",
  "| workload | base | PR | Δ |",
  "| --- | --- | --- | --- |",
  `| distinct queries (uncached) | ${base.msPerQueryDistinct} | ${pr.msPerQueryDistinct} | ${fmt(distinctDelta)} |`,
  `| repeated queries (cached) | ${base.msPerQueryRepeated} | ${pr.msPerQueryRepeated} | ${fmt(repeatedDelta)} |`,
  "",
  distinctDelta >= threshold
    ? `⚠️ **Uncached path ${fmt(distinctDelta)} vs base** (threshold ${threshold}%). Same-runner comparison, so this is a real regression.`
    : distinctDelta < -10
      ? `Uncached path ${fmt(distinctDelta)} vs base. 🎉`
      : `Uncached path ${fmt(distinctDelta)} vs base — within noise.`,
];

const summary = lines.join("\n");
console.log(summary);

const out = process.env.GITHUB_STEP_SUMMARY;
if (out) fs.appendFileSync(out, summary + "\n");

if (distinctDelta >= threshold) {
  console.error(`\nRegression ${fmt(distinctDelta)} exceeds threshold ${threshold}%`);
  process.exit(1);
}
