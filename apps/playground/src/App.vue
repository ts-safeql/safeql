<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import MonacoEditor from "./components/MonacoEditor.vue";
import { DEFAULT_CODE, DEFAULT_CONFIG, DEFAULT_SCHEMA } from "./lib/defaults";
import type { EngineDiagnostic } from "./lib/eslint-engine";
import { parsePlaygroundConfig } from "./lib/playground-config";
import { lintReal } from "./lib/real-lint-client";
import { readPlaygroundStateFromUrl, writePlaygroundStateToUrl } from "./lib/share-url";

// Start from defaults; if the URL carries shared state we hydrate it in onMounted (decoding is
// async because it inflates a compressed hash).
const schema = ref(DEFAULT_SCHEMA);
const code = ref(DEFAULT_CODE);
const config = ref(DEFAULT_CONFIG);
const diagnostics = ref<EngineDiagnostic[]>([]);
const status = ref("Ready");
const lintError = ref<string | null>(null);
const configError = ref<string | null>(null);
const loading = ref(false);

let lintTimer: ReturnType<typeof setTimeout> | undefined;
let urlTimer: ReturnType<typeof setTimeout> | undefined;
let lintId = 0;
let hydrateId = 0;
const shareStatus = ref<string | null>(null);

async function runLint() {
  const currentId = ++lintId;
  loading.value = true;
  status.value = "Linting…";
  lintError.value = null;

  const parsedConfig = parsePlaygroundConfig(config.value);
  configError.value = parsedConfig.error ?? null;

  try {
    const result = await lintReal({
      schema: schema.value,
      code: code.value,
      config: parsedConfig.config,
    });

    // A newer lint started while we were awaiting — drop this stale result.
    if (currentId !== lintId) {
      return;
    }
    diagnostics.value = result;
    const count = result.length;
    status.value = count === 0 ? "No issues" : count === 1 ? "1 issue" : `${count} issues`;
  } catch (error) {
    if (currentId !== lintId) {
      return;
    }
    lintError.value = error instanceof Error ? error.message : String(error);
    diagnostics.value = [];
    status.value = "Lint failed";
  } finally {
    if (currentId === lintId) {
      loading.value = false;
    }
  }
}

function scheduleLint() {
  clearTimeout(lintTimer);
  lintTimer = setTimeout(() => void runLint(), 200);
}

// Fire-and-forget hash sync. Swallows a rare encode failure (e.g. CompressionStream abort) so it
// can't surface as an unhandled rejection; the hash simply stays at its previous value.
function syncUrlToState() {
  void writePlaygroundStateToUrl({
    schema: schema.value,
    code: code.value,
    config: config.value,
  }).catch(() => undefined);
}

function scheduleUrlSync() {
  // writePlaygroundStateToUrl no-ops when the encoded state is unchanged, so applying state from
  // a hashchange and re-syncing is harmless.
  clearTimeout(urlTimer);
  urlTimer = setTimeout(syncUrlToState, 300);
}

async function applyStateFromUrl() {
  // Guard against overlapping hydrations (rapid hashchanges, or one during initial mount): only
  // the most recent invocation applies, so results can't land out of order.
  const id = ++hydrateId;
  const hadHash = window.location.hash.replace(/^#/, "").length > 0;
  const next = await readPlaygroundStateFromUrl();
  if (id !== hydrateId) {
    return;
  }

  if (!next) {
    // A non-empty but undecodable hash is a broken share link — tell the user rather than
    // silently showing the defaults (which looks identical to a fresh visit).
    if (hadHash) {
      shareStatus.value = "Failed to load shared link";
      setTimeout(() => {
        shareStatus.value = null;
      }, 2000);
    }
    return;
  }

  schema.value = next.schema;
  code.value = next.code;
  config.value = next.config ?? DEFAULT_CONFIG;
}

async function copyShareUrl() {
  // Flush the pending URL-sync debounce so we never copy a hash that lags the latest edits.
  clearTimeout(urlTimer);

  try {
    await writePlaygroundStateToUrl({
      schema: schema.value,
      code: code.value,
      config: config.value,
    });
    await navigator.clipboard.writeText(window.location.href);
    shareStatus.value = "Link copied";
    setTimeout(() => {
      shareStatus.value = null;
    }, 2000);
  } catch {
    shareStatus.value = "Copy failed";
    setTimeout(() => {
      shareStatus.value = null;
    }, 2000);
  }
}

const panelsEl = ref<HTMLElement | null>(null);
const rightColumnEl = ref<HTMLElement | null>(null);
const columnSizes = ref([1, 1, 1]);
const rightSizes = ref([1, 0.5]);
const dragging = ref(false);

function ratioStyle(sizes: number[], index: number) {
  return { flex: `${sizes[index]} 1 0`, minWidth: "0", minHeight: "0" };
}

function columnStyle(index: number) {
  return ratioStyle(columnSizes.value, index);
}

function rightStyle(index: number) {
  return ratioStyle(rightSizes.value, index);
}

function createResizer(
  sizes: Ref<number[]>,
  axis: "x" | "y",
  getContainer: () => HTMLElement | null,
) {
  let index = -1;
  let startPos = 0;
  let startSizes: number[] = [];
  let extent = 1;

  function onMove(event: PointerEvent) {
    if (index < 0) {
      return;
    }

    const total = startSizes.reduce((sum, size) => sum + size, 0);
    const pos = axis === "x" ? event.clientX : event.clientY;
    const delta = ((pos - startPos) / extent) * total;
    const before = startSizes[index] + delta;
    const after = startSizes[index + 1] - delta;
    const min = 0.15;

    if (before < min || after < min) {
      return;
    }

    const next = [...startSizes];
    next[index] = before;
    next[index + 1] = after;
    sizes.value = next;
  }

  function stop() {
    index = -1;
    dragging.value = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
  }

  function start(handleIndex: number, event: PointerEvent) {
    event.preventDefault();
    index = handleIndex;
    startPos = axis === "x" ? event.clientX : event.clientY;
    startSizes = [...sizes.value];
    const rect = getContainer()?.getBoundingClientRect();
    extent = (axis === "x" ? rect?.width : rect?.height) ?? 1;
    dragging.value = true;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  }

  return { start, stop };
}

const columnResizer = createResizer(columnSizes, "x", () => panelsEl.value);
const rightResizer = createResizer(rightSizes, "y", () => rightColumnEl.value);

const statusText = computed(
  () => lintError.value ?? configError.value ?? shareStatus.value ?? status.value,
);
const statusTone = computed<"error" | "ok" | "neutral">(() => {
  if (
    lintError.value ||
    configError.value ||
    shareStatus.value === "Copy failed" ||
    shareStatus.value === "Failed to load shared link"
  ) {
    return "error";
  }
  if (loading.value || shareStatus.value === "Link copied") {
    return "neutral";
  }
  return diagnostics.value.length > 0 ? "error" : "ok";
});

onMounted(async () => {
  // Register before the first await so an unmount during hydration can't leave a stale listener.
  window.addEventListener("hashchange", applyStateFromUrl);
  // Hydrate shared state before the first lint so we lint the shared content, not the defaults.
  await applyStateFromUrl();
  syncUrlToState();
  // Hydration may have scheduled a debounced lint via the watcher; drop it and lint once now.
  clearTimeout(lintTimer);
  void runLint();
});

onUnmounted(() => {
  window.removeEventListener("hashchange", applyStateFromUrl);
  columnResizer.stop();
  rightResizer.stop();
  clearTimeout(lintTimer);
  clearTimeout(urlTimer);
});

watch([schema, code, config], () => {
  scheduleLint();
  scheduleUrlSync();
});
</script>

<template>
  <div class="playground">
    <header class="header">
      <h1>SafeQL Playground</h1>
      <div class="header-actions">
        <span class="status" :class="`status-${statusTone}`">
          <span class="status-dot"></span>
          {{ statusText }}
        </span>
        <button type="button" class="share-button" @click="copyShareUrl">Copy link</button>
      </div>
    </header>

    <div class="panels" ref="panelsEl" :class="{ dragging }">
      <section class="panel" :style="columnStyle(0)">
        <div class="panel-header">Schema (SQL)</div>
        <MonacoEditor v-model="schema" language="sql" />
      </section>

      <div class="splitter" @pointerdown="columnResizer.start(0, $event)"></div>

      <section class="panel" :style="columnStyle(1)">
        <div class="panel-header">TypeScript</div>
        <MonacoEditor
          v-model="code"
          language="typescript"
          :diagnostics="lintError ? [] : diagnostics"
        />
      </section>

      <div class="splitter" @pointerdown="columnResizer.start(1, $event)"></div>

      <div class="panel-column" ref="rightColumnEl" :style="columnStyle(2)">
        <section class="panel" :style="rightStyle(0)">
          <div class="panel-header">Diagnostics</div>
          <div class="errors">
            <p v-if="loading" class="empty">Running SafeQL…</p>
            <p v-else-if="lintError" class="empty">{{ lintError }}</p>
            <p v-else-if="diagnostics.length === 0" class="empty">No SafeQL issues found.</p>
            <article v-for="(diagnostic, index) in diagnostics" :key="index" class="error-card">
              <div class="error-meta">
                {{ diagnostic.ruleId ?? "error" }} · Line {{ diagnostic.line }}, column
                {{ diagnostic.column }}
              </div>
              <pre class="error-plain">{{ diagnostic.message }}</pre>
            </article>
          </div>
        </section>

        <div class="splitter splitter-h" @pointerdown="rightResizer.start(0, $event)"></div>

        <section class="panel" :style="rightStyle(1)">
          <div class="panel-header" :class="{ 'header-error': configError }">
            Config (JSON){{ configError ? " — invalid" : "" }}
          </div>
          <p v-if="configError" class="config-error">{{ configError }}</p>
          <MonacoEditor v-model="config" language="json" />
        </section>
      </div>
    </div>
  </div>
</template>
