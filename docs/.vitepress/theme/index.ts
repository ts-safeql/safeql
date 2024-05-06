import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import Theme from "vitepress/theme";
import Layout from "./Layout.vue";
import "./custom.css";

export default {
  extends: Theme,
  Layout: Layout,
  async enhanceApp({ app }) {
    enhanceAppWithTabs(app);

    import("@vercel/analytics").then(({ default: analytics }) => {
      analytics.inject();
    });
  },
};
