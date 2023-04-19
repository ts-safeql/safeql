import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import "./custom.css";

export default {
  ...DefaultTheme,
  Layout: Layout,
  async enhanceApp() {
    import("@vercel/analytics").then(({ default: analytics }) => {
      analytics.inject();
    });
  },
};
