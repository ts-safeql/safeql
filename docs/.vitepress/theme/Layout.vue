<script setup>
import DefaultTheme from "vitepress/theme";
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <video src="/video.mp4" />
    </template>
  </DefaultTheme.Layout>
</template>
