import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "@shikijs/vitepress-twoslash/style.css";
import type { EnhanceAppContext } from "vitepress";
import Theme from "vitepress/theme";
import Layout from "./Layout.vue";
import "./custom.css";

export default {
  extends: Theme,
  Layout: Layout,
  async enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
    import("@vercel/analytics").then(({ default: analytics }) => {
      analytics.inject();
    });
  },
};
