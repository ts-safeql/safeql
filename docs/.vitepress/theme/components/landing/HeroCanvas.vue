<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useData } from "vitepress";

const host = ref(null);
const { isDark } = useData();
let cleanup = () => {};

onMounted(() => {
  if (typeof window === "undefined" || !host.value) return;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dark = isDark.value;
  const stopDark = watch(isDark, (v) => {
    dark = v;
    if (prefersReduced) draw();
  });

  const el = host.value;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  el.appendChild(canvas);
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block" });

  let W = 0, H = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let dots = [];
  const circles = [
    { cx: 0.33, cy: 0.42, rx: 0.22, ry: 0.3, rr: 0.34, omega: 0.5, theta: 0, r: 0, x: 0, y: 0 },
    { cx: 0.56, cy: 0.58, rx: 0.27, ry: 0.3, rr: 0.3, omega: 0.41, theta: 2.3, r: 0, x: 0, y: 0 },
  ];
  let last = 0;
  let tw = 0;
  const FOLLOW = 0.28;
  const DRIFT = 45;
  let mx = 0, my = 0, offX = 0, offY = 0, hasMouse = false;

  function build() {
    dots = [];
    const gap = W < 760 ? 24 : 20;
    for (let y = gap / 2; y < H; y += gap) {
      for (let x = gap / 2; x < W; x += gap) {
        const h1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const h2 = Math.sin(x * 39.346 + y * 11.135) * 24634.6345;
        const z = 0.2 + 0.8 * (h1 - Math.floor(h1));
        dots.push({ x, y, z, ph: (h2 - Math.floor(h2)) * Math.PI * 2, amp: 0.25 + 0.6 * z });
      }
    }
    const m = Math.min(W, H);
    for (const c of circles) {
      c.r = Math.max(150, m * c.rr);
      c.x = W * c.cx + W * c.rx * Math.cos(c.theta) + offX;
      c.y = H * c.cy + H * c.ry * Math.sin(c.theta) + offY;
    }
  }

  function resize() {
    W = el.clientWidth || window.innerWidth;
    H = el.clientHeight || window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const rgb = dark ? "255,255,255" : "0,0,0";

    for (const c of circles) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      g.addColorStop(0, `rgba(${rgb},${dark ? 0.05 : 0.045})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const d of dots) {
      let fmax = 0, pullx = 0, pully = 0;
      for (const c of circles) {
        const dx = c.x - d.x;
        const dy = c.y - d.y;
        let f = Math.max(0, 1 - Math.hypot(dx, dy) / c.r);
        f = f * f * (3 - 2 * f); // smoothstep
        if (f > fmax) fmax = f;
        pullx += dx * f * 0.06;
        pully += dy * f * 0.06;
      }

      const wob = (1 - fmax) * d.amp;
      const px = d.x + Math.sin(tw * 2.6 + d.ph) * wob + pullx;
      const py = d.y + Math.cos(tw * 2.2 + d.ph) * wob + pully;

      const ds = 0.7 + 0.6 * d.z;
      const a = (dark ? 0.04 : 0.06) + (dark ? 0.11 : 0.14) * d.z + (dark ? 0.55 : 0.5) * fmax;
      const r = ds + (1 - ds) * fmax;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let raf = 0;
  let visible = true;
  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    tw += dt;
    const tox = hasMouse ? (mx - W * 0.5) * FOLLOW : 0;
    const toy = hasMouse ? (my - H * 0.5) * FOLLOW : 0;
    const dox = tox - offX, doy = toy - offY;
    const dlen = Math.hypot(dox, doy);
    const step = Math.min(dlen, DRIFT * dt);
    if (dlen > 0.001) { offX += (dox / dlen) * step; offY += (doy / dlen) * step; }
    for (const c of circles) {
      c.theta += dt * c.omega;
      c.x = W * c.cx + W * c.rx * Math.cos(c.theta) + offX;
      c.y = H * c.cy + H * c.ry * Math.sin(c.theta) + offY;
    }
    draw();
    if (visible) raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !prefersReduced) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    { threshold: 0 }
  );

  const ro = new ResizeObserver(() => {
    resize();
    if (prefersReduced) draw();
  });
  ro.observe(el);
  resize();
  io.observe(el);

  function onMove(e) {
    const rect = el.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
    hasMouse = true;
  }
  if (!prefersReduced) window.addEventListener("mousemove", onMove, { passive: true });

  if (prefersReduced) draw();
  else raf = requestAnimationFrame(frame);

  cleanup = () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    stopDark();
    window.removeEventListener("mousemove", onMove);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  };
});

onBeforeUnmount(() => cleanup());
</script>

<template>
  <div ref="host" class="hero-canvas" aria-hidden="true" />
</template>

<style scoped>
.hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
