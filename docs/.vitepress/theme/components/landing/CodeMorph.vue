<script setup>
import { shallowRef, onMounted, computed } from "vue";
import { useData } from "vitepress";
import { ShikiMagicMove } from "@shikijs/magic-move/vue";
import "@shikijs/magic-move/style.css";
import { getHighlighter } from "./highlighter";

defineProps({
  code: { type: String, default: "" },
  splitTokens: { type: Boolean, default: true },
});
const emit = defineEmits(["ready", "morphend"]);

const { isDark } = useData();
const theme = computed(() => (isDark.value ? "safeql-dark" : "safeql-light"));

const hl = shallowRef(null);
onMounted(async () => {
  hl.value = await getHighlighter();
  emit("ready");
});
function onEnd() {
  emit("morphend");
}
</script>

<template>
  <ShikiMagicMove
    v-if="hl"
    lang="ts"
    :theme="theme"
    :highlighter="hl"
    :code="code"
    :options="{ duration: 650, stagger: 0.06, lineNumbers: false, animateContainer: true, splitTokens }"
    @end="onEnd"
  />
</template>
