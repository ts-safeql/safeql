<script setup>
import { onMounted, onBeforeUnmount, watch, ref, computed, defineAsyncComponent } from "vue";

const CodeMorph = defineAsyncComponent(() => import("./CodeMorph.vue"));

const props = defineProps({
  scene: { type: Number, default: 0 },
  auto: { type: Boolean, default: false },
  cycle: { type: Array, default: () => [0, 1, 2] },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["progress", "done"]);

const root = ref(null);
const demoRoot = ref(null);
const editor = ref(null);
const code = ref(null);
const hover = ref(null);
const cursor = ref(null);
const squig = ref(null);
let squigW = 0;
const errCount = ref(null);
const errDot = ref(null);

const fileLabel = ref("users.ts");
const autoStep = ref(0);
const autoProg = ref(0);

let io = null;
let tl = null;
let gap = null;
let visible = false;
let gsapRef = null;
let gsapReady = false;
let morphReady = false;
let started = false;
let autoPos = 0;

const H0_A = "function getUsers() {\n  return sql`\n    SELECT idd FROM users\n  `;\n}";
const H0_B = "function getUsers() {\n  return sql`\n    SELECT id FROM users\n  `;\n}";
const H1_A = "function getUsers() {\n  return sql`\n    SELECT id, email FROM users\n  `;\n}";
const H1_B = "function getUsers() {\n  return sql<{ id: number; email: string }>`\n    SELECT id, email FROM users\n  `;\n}";
const H2_A = "function getUsers() {\n  return sql<{ id: string }>`\n    SELECT id FROM users\n  `;\n}";
const H2_B = "function getUsers() {\n  return sql<{ id: number }>`\n    SELECT id FROM users\n  `;\n}";

const A1_A = "function postStats() {\n  return sql<{ author_id: number; posts: number }>`\n    SELECT author_id, count(*) AS posts\n    FROM posts\n    GROUP BY status\n  `;\n}";
const A1_B = "function postStats() {\n  return sql<{ author_id: number; posts: number }>`\n    SELECT author_id, count(*) AS posts\n    FROM posts\n    GROUP BY author_id\n  `;\n}";
const A1_C = "function postStats() {\n  return sql<{ author_id: number; posts: string }>`\n    SELECT author_id, count(*) AS posts\n    FROM posts\n    GROUP BY author_id\n  `;\n}";

const C_PG_A = "function postgresJs() {\n  return sql`\n    SELECT idd FROM users\n  `;\n}";
const C_PG_B = "function postgresJs() {\n  return sql`\n    SELECT id FROM users\n  `;\n}";
const C_SLO_A = "function slonik() {\n  return sql.type(z.object({ id: z.string() }))`\n    SELECT id FROM users\n  `;\n}";
const C_SLO_B = "function slonik() {\n  return sql.type(z.object({ id: z.number() }))`\n    SELECT id FROM users\n  `;\n}";
const C_PRI_A = "function prisma() {\n  return prisma.$queryRaw`\n    SELECT emial FROM users\n  `;\n}";
const C_PRI_B = "function prisma() {\n  return prisma.$queryRaw`\n    SELECT email FROM users\n  `;\n}";

const INC_A = "const $typedSql = sql;\n\nconst a = await sql`SELECT idd FROM users`;\nconst b = await sql`SELECT id FROM posts`;";
const INC_B = "const $typedSql = sql;\n\nconst a = await $typedSql`SELECT idd FROM users`;\nconst b = await sql`SELECT id FROM posts`;";
const INC_C = "const $typedSql = sql;\n\nconst a = await $typedSql`SELECT id FROM users`;\nconst b = await sql`SELECT id FROM posts`;";

const EXT_A = "connections({\n  plugins: [awsIamAuth()],\n  targets: [{ tag: \"sql\" }],\n});";
const EXT_B = "connections({\n  plugins: [awsIamAuth(), slonik()],\n  targets: [{ tag: \"sql\" }],\n});";
const EXT_C = "connections({\n  plugins: [awsIamAuth(), slonik(), myCustomPlugin()],\n  targets: [{ tag: \"sql\" }],\n});";

const SCENES = [
  {
    label: "Catches mistakes",
    file: "users.ts",
    code: H0_A,
    acts: [{ t: "error", find: ["idd", 1], msg: "column <b>idd</b> does not exist — did you mean <b>id</b>?", hold: 2.6, fix: H0_B, clear: true }],
  },
  {
    label: "Infers result types",
    file: "users.ts",
    code: H1_A,
    acts: [{ t: "error", find: ["sql", 1], msg: "query is missing its type annotation", hold: 2.4, fix: H1_B, clear: true }],
  },
  {
    label: "Auto-fixes types",
    file: "users.ts",
    code: H2_A,
    acts: [{ t: "error", find: ["string", 1], msg: "incorrect type annotation — expected <b>number</b>", hold: 2.4, fix: H2_B, clear: true }],
  },
  {
    file: "stats.ts",
    code: A1_A,
    acts: [
      { t: "error", find: ["author_id", 2], msg: "column <b>author_id</b> must appear in the <b>GROUP BY</b> clause", hold: 2.7, fix: A1_B },
      { t: "error", find: ["number", 2], msg: "<b>count(*)</b> is <b>bigint</b> — typed as <b>string</b>", hold: 2.7, fix: A1_C, clear: true },
    ],
  },
  {
    file: "queries.ts",
    code: C_PG_A,
    acts: [
      { t: "error", find: ["idd", 1], msg: "<b>postgres.js</b> — column <b>idd</b> does not exist, did you mean <b>id</b>?", hold: 2.4, fix: C_PG_B, clear: true },
      { t: "code", to: C_SLO_A },
      { t: "error", find: ["z.string", 1], msg: "<b>Slonik</b> — Zod schema doesn't match, expected <b>z.number()</b>", hold: 2.5, fix: C_SLO_B, clear: true },
      { t: "code", to: C_PRI_A },
      { t: "error", find: ["emial", 1], msg: "<b>Prisma</b> — column <b>emial</b> does not exist, did you mean <b>email</b>?", hold: 2.4, fix: C_PRI_B, clear: true },
    ],
  },
  {
    file: "db.ts",
    code: INC_A,
    acts: [
      { t: "info", find: ["$typedSql", 1], msg: "Alias your query tag once, then migrate one call at a time — the rest stay untouched.", hold: 2.6 },
      { t: "code", to: INC_B },
      { t: "error", find: ["idd", 1], msg: "now checked — column <b>idd</b> does not exist, did you mean <b>id</b>?", hold: 2.8, fix: INC_C, clear: true },
    ],
  },
  {
    file: "eslint.config.js",
    code: EXT_A,
    acts: [
      { t: "info", find: ["awsIamAuth", 1], msg: "<b>plugin-auth-aws</b> — connect to RDS with IAM.", hold: 2.4 },
      { t: "code", to: EXT_B },
      { t: "info", find: ["slonik", 1], msg: "<b>plugin-slonik</b> — full Slonik support.", hold: 2.4 },
      { t: "code", to: EXT_C },
      { t: "info", find: ["myCustomPlugin", 1], msg: "…or your own — connection, helper &amp; migration hooks.", hold: 2.8 },
    ],
  },
];

const srcCode = ref(SCENES[props.auto ? props.cycle[0] : props.scene].code);
// Custom gutter: Magic Move's own lineNumbers break splitTokens' offset math.
// Relies on no within-scene fix ever changing the line count.
const lineCount = computed(() => srcCode.value.split("\n").length);

function setErr(n) {
  if (errCount.value) errCount.value.textContent = n;
  if (errDot.value) errDot.value.style.color = n > 0 ? "#d9706f" : "#4b4b52";
}

function findRange(find) {
  const [needle, nth = 1] = Array.isArray(find) ? find : [find, 1];
  const container = code.value;
  if (!container) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== container) {
        if (el.classList && el.classList.contains("shiki-magic-move-line-number")) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let full = "";
  let n;
  while ((n = walker.nextNode())) {
    nodes.push({ node: n, start: full.length });
    full += n.nodeValue;
  }
  let idx = -1;
  for (let c = 0; c < nth; c++) {
    idx = full.indexOf(needle, idx + 1);
    if (idx === -1) return null;
  }
  const end = idx + needle.length;
  const locate = (pos) => {
    for (const nd of nodes) {
      if (pos >= nd.start && pos <= nd.start + nd.node.nodeValue.length) return { node: nd.node, offset: pos - nd.start };
    }
    return null;
  };
  const a = locate(idx);
  const b = locate(end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function rectOf(find) {
  const range = findRange(find);
  if (!range || !demoRoot.value) return null;
  const r = range.getBoundingClientRect();
  const o = demoRoot.value.getBoundingClientRect();
  return { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top, width: r.width, height: r.height };
}

function showSquiggle(rect, gsap) {
  if (!rect) return;
  // animate width (not scaleX, which would distort the wave shape)
  squigW = Math.max(rect.width, 8);
  gsap.set(squig.value, { left: rect.left, top: rect.bottom + 1, width: 0 });
}

function placeAt(rect) {
  if (!rect) return;
  const o = demoRoot.value.getBoundingClientRect();
  const hw = hover.value.offsetWidth;
  const maxLeft = window.innerWidth - o.left - hw - 8;
  const left = Math.max(8 - o.left, Math.min(rect.left, maxLeft));
  hover.value.style.left = left + "px";
  hover.value.style.top = rect.bottom + 11 + "px";
  hover.value.classList.add("below");
  hover.value.classList.remove("above");
}

function setInfo(text) {
  hover.value.classList.add("info");
  hover.value.innerHTML =
    `<div class="hv-info"><svg class="hv-ic" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M8 7.1v3.5M8 5.1v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg><span>${text}</span></div>`;
}
function setPopover(msg) {
  hover.value.classList.remove("info");
  hover.value.innerHTML =
    `<div class="hv-top"><span class="hv-msg">${msg}</span> <span class="hv-rule">eslint(<a>@ts-safeql/check-sql</a>)</span></div>` +
    `<div class="hv-actions"><span class="hv-act">View Problem <kbd>F2</kbd></span><span class="hv-act qf">Quick Fix… <kbd>⌘.</kbd></span></div>`;
}
function quickFixPos() {
  const o = demoRoot.value.getBoundingClientRect();
  const r = hover.value.querySelector(".qf").getBoundingClientRect();
  return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
}
function addAutofix(t, gsap, rectFn, applyFn) {
  let fx = 0, fy = 0;
  t.add(() => {
    const p = quickFixPos();
    fx = p.x;
    fy = p.y;
    const rect = rectFn() || { left: 0, bottom: 0, width: 0 };
    gsap.set(cursor.value, { left: rect.left + Math.min(rect.width, 90), top: rect.bottom + 4, opacity: 0, scale: 1 });
  })
    .to(cursor.value, { opacity: 1, duration: 0.2 })
    .to(cursor.value, { left: () => fx, top: () => fy, duration: 0.6, ease: "power2.inOut" })
    .to(cursor.value, { scale: 0.8, duration: 0.1 })
    .to(cursor.value, { scale: 1, duration: 0.12 })
    .add(applyFn)
    .to(hover.value, { opacity: 0, y: 6, duration: 0.25 }, "<")
    .to(cursor.value, { opacity: 0, duration: 0.25 }, "<");
}

function appendAct(t, gsap, act) {
  if (act.t === "code") {
    // cross-fade whole-block swaps; a char-level morph of an unrelated block scrambles
    t.to(code.value, { opacity: 0, duration: 0.28 })
      .add(() => { srcCode.value = act.to; })
      .to({}, { duration: 0.72 })
      .to(code.value, { opacity: 1, duration: 0.3 });
    return;
  }
  if (act.t === "info") {
    t.add(() => { setInfo(act.msg); placeAt(rectOf(act.find)); })
      .to(hover.value, { opacity: 1, y: 0, scale: 1, duration: 0.35 })
      .to({}, { duration: act.hold ?? 2.6 })
      .to(hover.value, { opacity: 0, y: 6, duration: 0.3 });
    return;
  }
  if (act.t === "error") {
    t.add(() => { setErr(1); showSquiggle(rectOf(act.find), gsap); })
      .to(squig.value, { width: () => squigW, opacity: 1, duration: 0.4, ease: "none" })
      .add(() => { setPopover(act.msg); placeAt(rectOf(act.find)); })
      .to(hover.value, { opacity: 1, y: 0, scale: 1, duration: 0.35 })
      .to({}, { duration: act.hold ?? 2.6 });
    if (act.fix) {
      // morph the fix in place (hero is char-level, feature is token-level)
      addAutofix(t, gsap, () => rectOf(act.find), () => {
        srcCode.value = act.fix;
        gsap.set(squig.value, { width: 0, opacity: 0 });
        if (act.clear) setErr(0);
      });
      t.to({}, { duration: 0.95 });
    } else {
      t.to(hover.value, { opacity: 0, y: 6, duration: 0.3 })
        .to(squig.value, { opacity: 0, duration: 0.3 }, "<")
        .add(() => { if (act.clear !== false) setErr(0); });
    }
    return;
  }
}

function buildScene(i, gsap) {
  const s = SCENES[i];
  gsap.set(hover.value, { opacity: 0, y: 6, scale: 0.98 });
  gsap.set(cursor.value, { opacity: 0 });
  gsap.set(squig.value, { opacity: 0, width: 0 });
  setErr(0);
  const enter = () => { srcCode.value = s.code; fileLabel.value = s.file; setErr(0); };
  const t = gsap.timeline({ defaults: { ease: "power2.out" } });
  if (started && !props.auto) {
    t.to(code.value, { opacity: 0, duration: 0.3 })
      .add(enter)
      .to({}, { duration: 0.72 })
      .to(code.value, { opacity: 1, duration: 0.3 });
  } else {
    started = true;
    t.add(enter).set(code.value, { opacity: 1 }).to({}, { duration: 0.65 });
  }
  s.acts.forEach((act) => appendAct(t, gsap, act));
  t.to({}, { duration: 0.6 });
  return t;
}

function sceneIndex() {
  return props.auto ? props.cycle[autoPos % props.cycle.length] : props.scene;
}
const ready = () => gsapReady && morphReady;

function play() {
  if (!ready() || !gsapRef) return;
  const i = sceneIndex();
  if (props.auto) autoStep.value = autoPos % props.cycle.length;
  if (!visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    fileLabel.value = SCENES[i].file;
    srcCode.value = SCENES[i].code;
    gsapRef.set(code.value, { opacity: 1 });
    return;
  }
  tl = buildScene(i, gsapRef);
  if (props.auto) {
    autoProg.value = 0;
    tl.eventCallback("onUpdate", () => (autoProg.value = tl.progress()));
  } else {
    emit("progress", 0);
    tl.eventCallback("onUpdate", () => emit("progress", tl.progress()));
  }
  tl.eventCallback("onComplete", () => {
    if (!visible) return;
    if (props.auto) {
      autoPos++;
      gap = gsapRef.delayedCall(0.12, play);
    } else {
      emit("done");
    }
  });
}

function restart() {
  if (tl) tl.kill();
  if (gap) gap.kill();
  play();
}
function jumpAuto(k) {
  if (!props.auto) return;
  autoPos = k;
  restart();
}
function onMorphReady() {
  if (morphReady) return;
  morphReady = true;
  if (visible) restart();
}

watch(
  () => props.scene,
  () => {
    if (!props.auto) restart();
  }
);

onMounted(async () => {
  if (typeof window === "undefined") return;
  const { gsap } = await import("gsap");
  gsapRef = gsap;
  gsapReady = true;

  io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) restart();
      else {
        if (tl) tl.pause();
        if (gap) gap.kill();
      }
    },
    { threshold: 0.25 }
  );
  io.observe(root.value);
  if (visible && morphReady) restart();
});

onBeforeUnmount(() => {
  if (io) io.disconnect();
  if (tl) tl.kill();
  if (gap) gap.kill();
});
</script>

<template>
  <div ref="demoRoot" class="demo">
    <div ref="root" class="vsc" :class="{ compact }" role="img" aria-label="An editor showing SafeQL checking SQL against your schema.">
      <div class="vsc-title">
        <span class="lights"><i /><i /><i /></span>
        <span class="vsc-name">{{ fileLabel }}</span>
        <span class="lights-spacer" />
      </div>

      <div class="vsc-main">
        <div class="vsc-act" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="on"><path d="M7.5 22.5H17.595C17.07 23.4 16.11 24 15 24H7.5C4.185 24 1.5 21.315 1.5 18V6C1.5 4.89 2.1 3.93 3 3.405V18C3 20.475 5.025 22.5 7.5 22.5ZM21 8.121V18C21 19.6545 19.6545 21 18 21H7.5C5.8455 21 4.5 19.6545 4.5 18V3C4.5 1.3455 5.8455 0 7.5 0H12.879C13.4715 0 14.0505 0.24 14.4705 0.6585L20.3415 6.5295C20.766 6.954 21 7.5195 21 8.121ZM13.5 6.75C13.5 7.164 13.8375 7.5 14.25 7.5H19.1895L13.5 1.8105V6.75ZM19.5 18V9H14.25C13.0095 9 12 7.9905 12 6.75V1.5H7.5C6.672 1.5 6 2.1735 6 3V18C6 18.8265 6.672 19.5 7.5 19.5H18C18.828 19.5 19.5 18.8265 19.5 18Z" /></svg>
          <svg viewBox="0 0 16 16"><path d="M10.0195 10.7266C9.06578 11.5217 7.83875 12 6.5 12C3.46243 12 1 9.53757 1 6.5C1 3.46243 3.46243 1 6.5 1C9.53757 1 12 3.46243 12 6.5C12 7.83875 11.5217 9.06578 10.7266 10.0195L13.8535 13.1464C14.0488 13.3417 14.0488 13.6583 13.8535 13.8536C13.6583 14.0488 13.3417 14.0488 13.1464 13.8536L10.0195 10.7266ZM11 6.5C11 4.01472 8.98528 2 6.5 2C4.01472 2 2 4.01472 2 6.5C2 8.98528 4.01472 11 6.5 11C8.98528 11 11 8.98528 11 6.5Z" /></svg>
          <svg viewBox="0 0 24 24"><path d="M21 8.25C21 6.1815 19.3185 4.5 17.25 4.5C15.1815 4.5 13.5 6.1815 13.5 8.25C13.5 10.023 14.739 11.5035 16.395 11.892C16.116 12.819 15.2655 13.5 14.25 13.5H9.75C8.9025 13.5 8.1285 13.7925 7.5 14.268V7.4235C9.21 7.0755 10.5 5.5605 10.5 3.75C10.5 1.6815 8.8185 0 6.75 0C4.6815 0 3 1.6815 3 3.75C3 5.562 4.29 7.0755 6 7.4235V16.575C4.29 16.923 3 18.438 3 20.2485C3 22.317 4.6815 23.9985 6.75 23.9985C8.8185 23.9985 10.5 22.317 10.5 20.2485C10.5 18.4755 9.261 16.995 7.605 16.6065C7.884 15.6795 8.7345 14.9985 9.75 14.9985H14.25C16.0845 14.9985 17.61 13.6725 17.931 11.9295C19.674 11.607 21 10.0845 21 8.25ZM4.5 3.75C4.5 2.5095 5.5095 1.5 6.75 1.5C7.9905 1.5 9 2.5095 9 3.75C9 4.9905 7.9905 6 6.75 6C5.5095 6 4.5 4.9905 4.5 3.75ZM9 20.25C9 21.4905 7.9905 22.5 6.75 22.5C5.5095 22.5 4.5 21.4905 4.5 20.25C4.5 19.0095 5.5095 18 6.75 18C7.9905 18 9 19.0095 9 20.25ZM17.25 10.5C16.0095 10.5 15 9.4905 15 8.25C15 7.0095 16.0095 6 17.25 6C18.4905 6 19.5 7.0095 19.5 8.25C19.5 9.4905 18.4905 10.5 17.25 10.5Z" /></svg>
          <svg viewBox="0 0 16 16"><path d="M15 4.95703C15 4.58711 14.8563 4.24054 14.5949 3.97992L12.0096 1.39234C11.4879 0.86922 10.5788 0.86922 10.0571 1.39234L8 3.45119V3.32321C8 2.55068 7.37187 1.922 6.6 1.922H2.4C1.62813 1.922 1 2.55068 1 3.32321V13.5988C1 14.3713 1.62813 15 2.4 15H12.6667C13.4385 15 14.0667 14.3713 14.0667 13.5988V9.39514C14.0667 8.62261 13.4385 7.99393 12.6667 7.99393H12.5379L14.5949 5.93508C14.8553 5.67445 15 5.32602 15 4.95703ZM2.4 2.85521H6.6C6.85667 2.85521 7.06667 3.06446 7.06667 3.32228V7.99299H1.93333V3.32228C1.93333 3.06446 2.14333 2.85521 2.4 2.85521ZM1.93333 13.5979V8.92714H7.06667V14.0649H2.4C2.14333 14.0649 1.93333 13.8547 1.93333 13.5979ZM13.1333 9.39421V13.5979C13.1333 13.8547 12.9233 14.0649 12.6667 14.0649H8V8.92714H12.6667C12.9233 8.92714 13.1333 9.13638 13.1333 9.39421ZM8 7.99299V6.46287L9.5288 7.99299H8ZM13.9351 5.2737L11.3488 7.86221C11.1789 8.03223 10.8859 8.03223 10.716 7.86221L8.12973 5.2737C8.0448 5.18963 7.99813 5.07753 7.99813 4.95796C7.99813 4.83839 8.0448 4.7263 8.12973 4.64129L10.716 2.05278C10.8009 1.96777 10.9129 1.92106 11.0324 1.92106C11.1519 1.92106 11.2639 1.96777 11.3488 2.05278L13.9351 4.64129C14.02 4.72536 14.0667 4.83746 14.0667 4.95703C14.0667 5.0766 14.02 5.1887 13.9351 5.2737Z" /></svg>
        </div>

        <div ref="editor" class="vsc-editor">
          <div class="vsc-tabs">
            <span class="tab"><span class="ts">TS</span>{{ fileLabel }}<span class="tab-dot" /></span>
            <span class="tab dim"><span class="ts dim">TS</span>schema.ts</span>
          </div>
          <div class="breadcrumb"><span>src</span><i>›</i><span>db</span><i>›</i><span class="bc-file">{{ fileLabel }}</span></div>

          <div ref="code" class="vsc-code">
            <div class="gutter" aria-hidden="true"><span v-for="n in lineCount" :key="n">{{ n }}</span></div>
            <CodeMorph :code="srcCode" :split-tokens="!compact" @ready="onMorphReady" />
          </div>

          <div class="vsc-status">
            <span class="st-l">
              <span class="st-item"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M13 7l-5-5-5 5M8 2v9" /></svg>main</span>
              <span class="st-item"><span ref="errDot" class="st-err"><svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M8 4.6v4M8 10.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg> <span ref="errCount">0</span></span><span class="st-warn"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 2.2l6 11H2z" /><path d="M8 6.6v3M8 11.4v.1" /></svg> 0</span></span>
            </span>
            <span class="st-r">SafeQL</span>
          </div>
        </div>
      </div>
    </div>

    <div ref="hover" class="hover" aria-hidden="true" />
    <div ref="squig" class="squig" aria-hidden="true" />
    <svg ref="cursor" class="cursor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3l14 7-6 1.6L9.6 17z" fill="#f2f2f4" stroke="#0a0a0b" stroke-width="1.1" stroke-linejoin="round" />
    </svg>

    <div v-if="auto" class="stepper">
      <button v-for="(ci, k) in cycle" :key="k" class="stp" :class="{ on: k === autoStep }" type="button" @click="jumpAuto(k)">
        <span class="stp-track"><span class="stp-fill" :style="{ transform: `scaleX(${k === autoStep ? autoProg : 0})` }" /></span>
        <span class="stp-label">{{ SCENES[ci].label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.demo {
  --bg: #161618;
  --chrome: #121214;
  --border: #2a2a2d;
  --txt: #c7c7cc;
  --num: #46464d;
  --err: #d9706f;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative; /* positioning context for the overflowing hover/cursor/squiggle overlays */
}

.vsc {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg);
  box-shadow: 0 24px 70px -40px rgba(0, 0, 0, 0.9);
  font-family: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  color: var(--txt);
  text-align: left;
}
.vsc.compact .vsc-act,
.vsc.compact .vsc-tabs,
.vsc.compact .breadcrumb,
.vsc.compact .vsc-status { display: none; }

.vsc-title { display: flex; align-items: center; height: 36px; padding: 0 13px; background: var(--chrome); border-bottom: 1px solid var(--border); }
.lights { display: flex; gap: 7px; }
.lights i { width: 11px; height: 11px; border-radius: 50%; background: #34343a; }
.vsc-name { flex: 1; text-align: center; font-size: 12px; color: #6a6a72; }
.lights-spacer { width: 47px; }

.vsc-main { display: flex; }
.vsc-act { width: 44px; flex-shrink: 0; background: var(--chrome); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 14px 0; }
.vsc-act svg { width: 21px; height: 21px; fill: #44444c; }
.vsc-act svg.on { fill: #d4d4d8; }

.vsc-editor { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
.vsc-tabs { display: flex; background: var(--chrome); border-bottom: 1px solid var(--border); }
.tab { display: flex; align-items: center; gap: 8px; padding: 9px 16px; font-size: 12.5px; color: #c7c7cc; background: var(--bg); border-top: 1.5px solid #6a7da0; border-right: 1px solid var(--border); }
.tab.dim { color: #5e5e66; background: var(--chrome); border-top: 1.5px solid transparent; }
.tab .ts { font-size: 9.5px; font-weight: 600; color: #6a7da0; }
.tab .ts.dim { color: #44444c; }
.tab-dot { width: 7px; height: 7px; border-radius: 50%; background: #6a6a72; margin-left: 2px; }
.breadcrumb { display: flex; align-items: center; gap: 7px; padding: 6px 18px; font-size: 11.5px; color: #54545c; border-bottom: 1px solid var(--border); }
.breadcrumb i { font-style: normal; color: #3a3a40; }
.breadcrumb .bc-file { color: #6a6a72; }

.vsc-code { position: relative; padding: 16px 16px 20px; min-height: 240px; box-sizing: border-box; font-size: 13.5px; line-height: 1.95; flex: 1; overflow-x: auto; overflow-y: hidden; display: flex; align-items: flex-start; }
.gutter {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-width: 1.4em;
  margin-right: 18px;
  text-align: right;
  color: var(--num);
  user-select: none;
  font-family: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
.vsc-code :deep(.shiki-magic-move-container) {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0; /* drop the <pre> UA 1em margin so it aligns with the gutter */
  font-family: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  white-space: pre;
  background: transparent !important;
}
.vsc-code :deep(.shiki-magic-move-item) { background: transparent !important; }

.squig {
  position: absolute;
  z-index: 4;
  height: 5px;
  background: var(--err);
  -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='5'%3E%3Cpath%20d='M0%204%20Q2%201%204%204%20T8%204'%20stroke='black'%20fill='none'%20stroke-width='1.4'/%3E%3C/svg%3E") repeat-x;
  mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='8'%20height='5'%3E%3Cpath%20d='M0%204%20Q2%201%204%204%20T8%204'%20stroke='black'%20fill='none'%20stroke-width='1.4'/%3E%3C/svg%3E") repeat-x;
  -webkit-mask-size: 8px 5px;
  mask-size: 8px 5px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.hover {
  position: absolute;
  z-index: 5;
  width: max-content;
  max-width: 420px;
  --pop-bg: #202022;
  --pop-bd: #3a3a40;
  background: var(--pop-bg);
  border: 1px solid var(--pop-bd);
  border-radius: 5px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6);
  font-size: 12.5px;
  line-height: 1.55;
  opacity: 0;
}
.hover.info::before {
  content: "";
  position: absolute;
  left: 22px;
  width: 9px;
  height: 9px;
  background: var(--pop-bg);
  transform: rotate(45deg);
}
.hover.info.below::before {
  top: -5px;
  border-left: 1px solid var(--pop-bd);
  border-top: 1px solid var(--pop-bd);
}
.hover.info.above::before {
  bottom: -5px;
  border-right: 1px solid var(--pop-bd);
  border-bottom: 1px solid var(--pop-bd);
}
.hover :deep(.hv-top) { padding: 9px 13px; color: #d4d4d8; }
.hover :deep(.hv-msg b) { color: #ededf0; font-weight: 600; }
.hover :deep(.hv-rule) { color: #74747e; font-family: "Geist Mono", monospace; font-size: 11.5px; }
.hover :deep(.hv-rule a) { color: #7e93b4; text-decoration: underline; text-underline-offset: 2px; }
.hover :deep(.hv-actions) { display: flex; gap: 18px; padding: 7px 13px; border-top: 1px solid #303034; background: #1b1b1d; border-radius: 0 0 5px 5px; }
.hover :deep(.hv-act) { color: #7e93b4; font-size: 12px; }
.hover :deep(.hv-act kbd) { color: #6a6a72; font-family: "Geist Mono", monospace; font-size: 11px; margin-left: 4px; }
.hover.info { max-width: 320px; --pop-bg: #1b1f2b; --pop-bd: #36405a; }
.hover :deep(.hv-info) { display: flex; align-items: flex-start; gap: 9px; padding: 10px 13px; color: #c4ccdc; font-family: "Geist", system-ui, sans-serif; line-height: 1.5; }
.hover :deep(.hv-info b) { color: #ededf0; font-weight: 600; }
.hover :deep(.hv-ic) { color: #8aa6d4; flex-shrink: 0; margin-top: 1px; }

.cursor { position: absolute; z-index: 6; width: 20px; height: 20px; left: 0; top: 0; opacity: 0; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5)); }

.vsc-status { display: flex; align-items: center; justify-content: space-between; height: 24px; padding: 0 12px; background: var(--chrome); border-top: 1px solid var(--border); font-size: 11.5px; color: #6a6a72; }
.st-l { display: inline-flex; align-items: center; gap: 16px; }
.st-item { display: inline-flex; align-items: center; gap: 5px; }
.st-item svg { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.st-err { display: inline-flex; align-items: center; gap: 4px; color: #4b4b52; transition: color 0.4s ease; }
.st-warn { display: inline-flex; align-items: center; gap: 4px; color: #4b4b52; }

.stepper { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.stp { appearance: none; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 9px; font-family: var(--vp-font-family-base, "Geist", system-ui, sans-serif); }
.stp-track { height: 2px; background: #2a2a2d; border-radius: 2px; overflow: hidden; }
.stp-fill { display: block; height: 100%; background: #9aa3b4; transform-origin: left; transform: scaleX(0); }
.stp-label { font-family: var(--vp-font-family-mono, "Geist Mono", ui-monospace, monospace); font-size: 12px; letter-spacing: -0.01em; color: #5e5e66; transition: color 0.3s ease; }
.stp.on .stp-label,
.stp:hover .stp-label { color: #d4d4d8; }

@media (max-width: 520px) {
  .vsc-code { font-size: 10.5px; padding: 12px 12px 14px; }
  .vsc-code :deep(.shiki-magic-move-line-number) { margin-right: 12px; }
  .hover { max-width: 250px; }
  .stp-label { font-size: 11px; }
}

html:not(.dark) .demo {
  --bg: #ffffff;
  --chrome: #f3f3f4;
  --border: #e4e4e8;
  --txt: #1f2328;
  --num: #b6b6bc;
  --err: #cf222e;
}
html:not(.dark) .vsc { box-shadow: 0 16px 50px -30px rgba(0, 0, 0, 0.28); }
html:not(.dark) .lights i { background: #dcdce0; }
html:not(.dark) .vsc-name { color: #8a8a92; }
html:not(.dark) .vsc-act svg { fill: #b6b6bc; }
html:not(.dark) .vsc-act svg.on { fill: #3a3a40; }
html:not(.dark) .tab { color: #1f2328; }
html:not(.dark) .tab.dim { color: #8a8a92; }
html:not(.dark) .tab .ts.dim { color: #b6b6bc; }
html:not(.dark) .tab-dot { background: #9a9aa0; }
html:not(.dark) .breadcrumb { color: #8a8a92; }
html:not(.dark) .breadcrumb i { color: #c4c4c8; }
html:not(.dark) .breadcrumb .bc-file { color: #57606a; }
html:not(.dark) .vsc-status { color: #8a8a92; }
html:not(.dark) .st-err,
html:not(.dark) .st-warn { color: #b0b0b6; }

html:not(.dark) .hover { --pop-bg: #ffffff; --pop-bd: #d7d7db; }
html:not(.dark) .hover :deep(.hv-top) { color: #24292f; }
html:not(.dark) .hover :deep(.hv-msg b) { color: #1f2328; }
html:not(.dark) .hover :deep(.hv-rule) { color: #8a8a92; }
html:not(.dark) .hover :deep(.hv-rule a),
html:not(.dark) .hover :deep(.hv-act) { color: #4a6da0; }
html:not(.dark) .hover :deep(.hv-actions) { border-top-color: #e4e4e8; background: #f6f6f7; }
html:not(.dark) .hover :deep(.hv-act kbd) { color: #8a8a92; }
html:not(.dark) .hover.info { --pop-bg: #eef2fb; --pop-bd: #c2cee6; }
html:not(.dark) .hover :deep(.hv-info) { color: #2a3344; }
html:not(.dark) .hover :deep(.hv-info b) { color: #1f2328; }
html:not(.dark) .hover :deep(.hv-ic) { color: #4a6da0; }

html:not(.dark) .cursor path { fill: #1f1f1f; stroke: #ffffff; }

html:not(.dark) .stp-track { background: #e4e4e8; }
html:not(.dark) .stp-label { color: #8a8a92; }
html:not(.dark) .stp.on .stp-label,
html:not(.dark) .stp:hover .stp-label { color: #24292f; }
</style>
