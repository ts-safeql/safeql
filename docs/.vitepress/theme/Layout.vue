<script setup>
import DefaultTheme from "vitepress/theme";
import Comments from "./components/Comments.vue";
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-after>
      <Comments />
    </template>
  </DefaultTheme.Layout>
</template>
