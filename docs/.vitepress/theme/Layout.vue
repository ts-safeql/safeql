<script setup>
import DefaultTheme from "vitepress/theme";
import Comments from './components/Comments.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <video autoplay loop muted src="/video.mp4" class="video" />
    </template>
    <template #doc-after>
      <Comments />
    </template>
  </DefaultTheme.Layout>
</template>

<style scoped>
.video {
  position: absolute;
  top: 50%;
  left: 50%;
  max-height: 192px;
  transform: translate(-50%, -50%);
}

@media (min-width: 640px) {
  .video {
    max-height: unset;
  }
}
</style>
