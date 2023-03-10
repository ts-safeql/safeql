<script setup>
import DefaultTheme from "vitepress/theme";
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <video src="/video.mp4" autoplay loop muted />
    </template>
  </DefaultTheme.Layout>
</template>
