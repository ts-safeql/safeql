<script setup lang="ts">
import { useData } from "vitepress";

const { frontmatter, title } = useData();
</script>

<template>
  <div v-if="frontmatter.comments === true" :key="title" class="giscus">
    <component
      :is="'script'"
      src="https://giscus.app/client.js"
      data-repo="ts-safeql/safeql"
      data-repo-id="R_kgDOH9VoWg"
      data-category="General"
      data-category-id="DIC_kwDOH9VoWs4CRXCs"
      data-mapping="og:title"
      data-strict="0"
      data-reactions-enabled="0"
      data-emit-metadata="0"
      data-input-position="top"
      data-lang="en"
      data-theme="transparent_dark"
      data-loading="lazy"
      async
    />
  </div>
</template>

<style>
.giscus {
    padding-top: 24px;
    margin-top: 24px;
    display: grid;
    grid-row-gap: 8px;
}
</style>
