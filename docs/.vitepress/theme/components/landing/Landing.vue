<script setup>
import { onBeforeUnmount, ref } from "vue";
import { useData, withBase } from "vitepress";
import HeroCanvas from "./HeroCanvas.vue";
import EditorDemo from "./EditorDemo.vue";

const { site } = useData();


const AGENT_PROMPT = `Set up SafeQL in my project — it's an ESLint plugin that type-checks raw SQL against my real PostgreSQL schema.

1. Install: npm i -D @ts-safeql/eslint-plugin libpg-query
2. Add to my ESLint flat config:
   import safeql from "@ts-safeql/eslint-plugin/config";
   export default [
     safeql.configs.connections({
       databaseUrl: process.env.DATABASE_URL,
       targets: [{ tag: "sql" }],
     }),
   ];
3. Use my existing database connection or migrations folder.

Docs: https://safeql.dev/guide/getting-started`;

const copied = ref(false);
let copyTimer = null;
function copyPrompt() {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  navigator.clipboard.writeText(AGENT_PROMPT).then(() => {
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = false), 2200);
  });
}

const howIdx = ref(0);
const howProgress = ref(0);
const topFeatures = [
  {
    title: "Catches what TypeScript can't",
    desc: "A wrong GROUP BY, a count that's secretly a bigint — SafeQL runs every query against your real schema and flags the bugs the compiler can't see.",
  },
  {
    title: "Works with any client",
    desc: "postgres.js, Slonik, Prisma, Kysely, Drizzle and more — SafeQL matches each client's own calls by tag or wrapper.",
  },
  {
    title: "Incrementally adoptable",
    desc: "Point a typed alias at one query and adopt SafeQL at your own pace — everything else stays untouched, and you can opt out anytime.",
  },
  {
    title: "Extensible",
    desc: "Compose official plugins — AWS IAM auth, Slonik and more — or write your own connection, helper and migration hooks.",
  },
];

const features = [
  "Catches column typos", "Suggests the right column", "Type-mismatch detection", "Operator type errors",
  "GROUP BY errors", "Unknown table errors", "Invalid cast detection", "Ambiguous column detection",
  "Missing type annotations", "Wrong type annotations", "Enum value validation",
  "Automatic result types", "Nullability inference", "Outer-join nullability", "Nullable aggregates",
  "count(*) is bigint, not number", "numeric → string (no precision loss)", "timestamptz → Date",
  "uuid & enum types", "json / jsonb result types", "array element types", "Literal type inference",
  "Custom Postgres → TS overrides", "Per-column type overrides", "snake_case → camelCase",
  "Your own casing convention", "null vs undefined vs optional", "Wrap results as {type}[]",
  "CTEs & recursive queries", "Subqueries", "LATERAL joins", "Window functions",
  "Aggregates (sum, array_agg)", "json_agg / jsonb_agg", "INSERT/UPDATE/DELETE … RETURNING",
  "ON CONFLICT upserts", "set-returning functions",
  "Validate against a live database", "Shadow DB from your migrations", "Watch mode for CI",
  "Multiple databases", "Monorepo-friendly",
  "postgres.js", "Slonik", "Prisma", "Kysely", "Drizzle", "node-postgres", "Sequelize", "@vercel/postgres",
  "Zod schema validation", "Zod schema generation", "SQL fragment composition", "Editor quick-fixes",
  "Auto-fix with --fix", "Incremental adoption", "Flexible query targeting", "Write your own plugins",
  "AWS IAM auth for RDS",
];

const ROWS = 5;
function isStrong(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100 < 38;
}
const featureRows = Array.from({ length: ROWS }, (_, r) =>
  features.filter((_, i) => i % ROWS === r).map((t) => ({ t, strong: isStrong(t) }))
);

const howRoot = ref(null);
let advanceTimer = null;
const HOLD = 1500;

function onSceneProgress(p) {
  howProgress.value = p;
}
function onSceneDone() {
  if (advanceTimer) clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    howIdx.value = (howIdx.value + 1) % topFeatures.length;
  }, HOLD);
}
function howSelect(i) {
  if (advanceTimer) clearTimeout(advanceTimer);
  howIdx.value = i;
  howProgress.value = 0;
}

onBeforeUnmount(() => {
  if (advanceTimer) clearTimeout(advanceTimer);
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <div class="landing">
    <section class="hero" data-hero>
      <HeroCanvas />
      <div class="hero-veil" aria-hidden="true" />
      <div class="hero-grid">
        <div class="hero-copy">
          <h1 class="hero-title">Write SQL queries with confidence.</h1>
          <p class="hero-sub">
            An ESLint plugin that validates raw SQL against your real PostgreSQL
            schema and infers result types — before the query ever runs.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" :href="withBase('/guide/getting-started')">Get started</a>
            <a class="btn btn-ghost" href="https://github.com/ts-safeql/safeql" target="_blank" rel="noreferrer">
              <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
          <button class="agent-copy" :class="{ copied }" type="button" @click="copyPrompt">
            <svg v-if="!copied" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7" />
              <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{{ copied ? "Copied — paste into your agent" : "Copy setup prompt for your agent" }}</span>
          </button>
        </div>
        <div class="hero-demo">
          <EditorDemo auto :cycle="[0, 1, 2]" />
        </div>
      </div>
    </section>

    <section ref="howRoot" class="section how">
      <div class="how-head">
        <span class="kicker">Features</span>
        <h2>See SafeQL work, feature by feature.</h2>
      </div>
      <div class="how-grid">
        <div class="acc">
          <button
            v-for="(s, i) in topFeatures"
            :key="i"
            class="acc-item"
            :class="{ on: howIdx === i }"
            type="button"
            @click="howSelect(i)"
          >
            <span class="acc-prog" :style="{ transform: `scaleX(${howIdx === i ? howProgress : 0})` }" />
            <span class="acc-title">{{ s.title }}</span>
            <div class="acc-body"><p>{{ s.desc }}</p></div>
          </button>
        </div>
        <div class="how-ide">
          <EditorDemo :scene="howIdx + 3" compact @progress="onSceneProgress" @done="onSceneDone" />
        </div>
      </div>

      <div class="more">
        <div class="ticker" aria-hidden="true">
          <div
            v-for="(row, ri) in featureRows"
            :key="ri"
            class="ticker-row"
            :class="{ rev: ri % 2 === 1 }"
            :style="{ '--dur': row.length * 4.5 + 's' }"
          >
            <div class="ticker-track">
              <span v-for="(f, i) in row.concat(row)" :key="i" class="ticker-item" :class="{ strong: f.strong }">{{ f.t }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <div class="foot-inner">
        <div class="foot-brand">
          <img :src="withBase('/safeql-logo.svg')" alt="" class="brand-mark" />
          <span>{{ site.title }}</span>
        </div>
        <div class="foot-links">
          <a :href="withBase('/guide/introduction')">Guide</a>
          <a :href="withBase('/api/')">API</a>
          <a href="https://github.com/ts-safeql/safeql" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://x.com/CoEliya" target="_blank" rel="noreferrer">X</a>
        </div>
        <span class="foot-note">MIT Licensed · Built for PostgreSQL</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  --bg: #0a0a0b;
  --bg-2: #101012;
  --panel: rgba(255, 255, 255, 0.024);
  --line: rgba(255, 255, 255, 0.1);
  --line-soft: rgba(255, 255, 255, 0.06);
  --line-strong: rgba(255, 255, 255, 0.28);
  --raise: rgba(255, 255, 255, 0.035);
  --raise-soft: rgba(255, 255, 255, 0.02);
  --raise-2: rgba(255, 255, 255, 0.05);
  --text: #ececed;
  --muted: #8c8c92;
  --faint: #5a5a60;
  --accent: #7c98c0;
  --ok: #8faa6e;
  --btn-hover: #ffffff;
  --r: 4px;
  /* matches the VitePress nav content column: width: min(100% - 64px, var(--cw)) + margin auto */
  --cw: calc(var(--vp-layout-max-width, 1440px) - 64px);
  --font: "Geist", system-ui, -apple-system, sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

  position: relative;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  line-height: 1.6;
  overflow-x: clip;
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.005em;
}
html:not(.dark) .landing {
  --bg: #ffffff;
  --bg-2: #f6f6f7;
  --panel: rgba(0, 0, 0, 0.025);
  --line: rgba(0, 0, 0, 0.12);
  --line-soft: rgba(0, 0, 0, 0.07);
  --line-strong: rgba(0, 0, 0, 0.28);
  --raise: rgba(0, 0, 0, 0.04);
  --raise-soft: rgba(0, 0, 0, 0.022);
  --raise-2: rgba(0, 0, 0, 0.06);
  --text: #1b1b1f;
  --muted: #555a63;
  --faint: #8a8a92;
  --accent: #4a6da0;
  --ok: #4d7a2e;
  --btn-hover: #000000;
}
.landing :where(h1, h2, h3) {
  line-height: 1.08;
  letter-spacing: -0.022em;
  font-weight: 540;
  margin: 0;
}

.hero {
  position: relative;
  min-height: calc(100vh - var(--vp-nav-height, 64px));
  min-height: calc(100svh - var(--vp-nav-height, 64px));
  display: grid;
  place-items: center;
  padding: 48px 0 72px;
  overflow: hidden;
}
.hero-veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(135% 100% at 60% 0%, transparent 58%, var(--bg) 97%);
  pointer-events: none;
}
.hero-grid {
  position: relative;
  z-index: 2;
  width: min(100% - 64px, var(--cw));
  margin-inline: auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr);
  gap: clamp(28px, 4.5vw, 60px);
  align-items: center;
}
.hero-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
}
.hero-demo {
  position: relative;
  width: 100%;
  min-width: 0;
}
.hero-title {
  font-size: clamp(2.1rem, 4vw, 3.4rem);
  font-weight: 540;
  letter-spacing: -0.03em;
  max-width: 13ch;
}
.hero-sub {
  max-width: 480px;
  font-size: clamp(1rem, 1.3vw, 1.12rem);
  color: var(--muted);
  margin: 0;
}
.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-radius: var(--r);
  font-weight: 500;
  font-size: 14.5px;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.btn-primary {
  background: var(--text);
  color: var(--bg);
}
.btn-primary:hover {
  background: var(--btn-hover);
}
.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--line);
}
.btn-ghost:hover {
  border-color: var(--line-strong);
}
.agent-copy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 13px;
  transition: color 0.2s ease;
}
.agent-copy:hover {
  color: var(--text);
}
.agent-copy.copied {
  color: var(--ok);
}

.section {
  position: relative;
  z-index: 1;
  width: min(100% - 64px, var(--cw));
  margin: 0 auto;
  padding: clamp(72px, 12vh, 140px) 0;
}
.kicker {
  display: inline-block;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 16px;
}
.section h2 {
  font-size: clamp(1.7rem, 3.4vw, 2.4rem);
}
.how-head {
  max-width: 720px;
}

.how-grid {
  margin-top: 48px;
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  gap: 32px;
  align-items: start;
}
.acc {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.acc-item {
  position: relative;
  overflow: hidden;
  appearance: none;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--r);
  padding: 16px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.25s ease;
}
.acc-item.on {
  background: var(--raise);
}
.acc-item:not(.on):hover {
  background: var(--raise-soft);
}
.acc-item:not(.on):hover .acc-title {
  color: var(--text);
}
/* doubles as the scene progress bar (scaleX driven by howProgress) */
.acc-prog {
  position: absolute;
  inset: 0;
  background: var(--raise-2);
  transform-origin: left;
  transform: scaleX(0);
  pointer-events: none;
  border-radius: inherit;
}
.acc-title,
.acc-body {
  position: relative;
  z-index: 1;
}
.acc-title {
  display: block;
  font-size: 1.1rem;
  font-weight: 540;
  color: var(--muted);
  transition: color 0.25s ease;
}
.acc-item.on .acc-title {
  color: var(--text);
}
.acc-body {
  /* animate 0fr ↔ 1fr (not height) so expand/collapse causes no layout shift on turns */
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.35s ease, opacity 0.35s ease, padding-top 0.35s ease;
}
.acc-item.on .acc-body {
  grid-template-rows: 1fr;
  opacity: 1;
  padding-top: 8px;
}
.acc-body p {
  margin: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.55;
}
.how-ide {
  min-width: 0;
}

.more {
  margin-top: 64px;
}
.ticker {
  /* full-bleed: span the viewport, escaping the container width */
  width: 100vw;
  margin-left: calc(50% - 50vw);
  display: flex;
  flex-direction: column;
  gap: 0;
  opacity: 0.25;
  pointer-events: none;
}
.ticker-row {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
}
.ticker-track {
  display: inline-flex;
  white-space: nowrap;
  will-change: transform;
  animation: ticker-move var(--dur, 60s) linear infinite;
}
.ticker-row.rev .ticker-track {
  animation-direction: reverse;
}
@keyframes ticker-move {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.ticker-item {
  padding-right: 1.7em;
  font-size: 20px;
  color: var(--faint);
}
.ticker-item.strong {
  color: var(--text);
  font-weight: 540;
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
}
.foot {
  border-top: 1px solid var(--line-soft);
  padding: 36px 0;
  background: var(--bg);
}
.foot-inner {
  width: min(100% - 64px, var(--cw));
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.foot-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 540;
}
.foot-brand .brand-mark {
  width: 18px;
  height: 23px;
}
.foot-links {
  display: flex;
  gap: 22px;
}
.foot-links a {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
}
.foot-links a:hover {
  color: var(--text);
}
.foot-note {
  color: var(--faint);
  font-size: 13px;
}

@media (max-width: 980px) {
  .hero {
    min-height: auto;
    place-items: start center;
    padding-top: 96px;
  }
  .hero-grid {
    grid-template-columns: 1fr;
    gap: 36px;
    max-width: 620px;
  }
  .hero-copy {
    align-items: center;
    text-align: center;
  }
  .hero-title {
    max-width: none;
  }
  .hero-sub {
    margin-inline: auto;
  }
  .hero-actions {
    justify-content: center;
  }
}
@media (max-width: 860px) {
  .how-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
