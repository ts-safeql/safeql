<script setup lang="ts">
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { EngineDiagnostic } from "../lib/eslint-engine";
import { registerSafeqlQuickFix, setModelDiagnostics } from "../lib/monaco-quickfix";
import { MONACO_THEME, setupMonacoShiki } from "../lib/monaco-shiki";

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    if (label === "json") {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

// We render SafeQL diagnostics ourselves; silence Monaco's own TS checker (it doesn't know the
// `sql`/`conn` globals and would add unrelated squiggles). The `typescript` namespace is typed
// as deprecated on the barrel but is present at runtime.
interface TsLanguageDefaults {
  setDiagnosticsOptions(options: {
    noSemanticValidation: boolean;
    noSyntaxValidation: boolean;
  }): void;
}
const typescriptLanguage = monaco.languages.typescript as unknown as {
  typescriptDefaults: TsLanguageDefaults;
};
typescriptLanguage.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

const props = defineProps<{
  modelValue: string;
  language: "typescript" | "sql" | "json";
  diagnostics?: EngineDiagnostic[];
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const host = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | undefined;

function applyMarkers(): void {
  const model = editor?.getModel();
  if (!model) {
    return;
  }

  if (props.language === "typescript") {
    setModelDiagnostics(model, props.diagnostics ?? []);
  }

  monaco.editor.setModelMarkers(
    model,
    "safeql",
    (props.diagnostics ?? []).map((diagnostic) => ({
      severity: monaco.MarkerSeverity.Error,
      message: diagnostic.message,
      startLineNumber: diagnostic.line,
      startColumn: diagnostic.column,
      endLineNumber: diagnostic.endLine,
      endColumn: diagnostic.endColumn,
    })),
  );
}

onMounted(async () => {
  try {
    await setupMonacoShiki();
  } catch (error) {
    console.error("[monaco-shiki] setup failed:", error instanceof Error ? error.stack : error);
  }
  if (props.language === "typescript") {
    registerSafeqlQuickFix();
  }
  if (host.value === null) {
    return;
  }

  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
    theme: MONACO_THEME,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    // Render hover/suggest widgets at the document body so the panel's overflow:hidden
    // doesn't clip them.
    fixedOverflowWidgets: true,
  });

  editor.onDidChangeModelContent(() => emit("update:modelValue", editor?.getValue() ?? ""));
  applyMarkers();
});

watch(
  () => props.modelValue,
  (value) => {
    const model = editor?.getModel();
    if (!editor || !model || editor.getValue() === value) {
      return;
    }
    // Replace via an edit rather than setValue so an external update (e.g. URL hydration) keeps
    // the cursor position and undo history instead of resetting to the top.
    editor.executeEdits("external", [{ range: model.getFullModelRange(), text: value }]);
  },
);

watch(() => props.diagnostics, applyMarkers, { deep: true });

onBeforeUnmount(() => editor?.dispose());
</script>

<template>
  <div ref="host" class="editor-wrap"></div>
</template>
