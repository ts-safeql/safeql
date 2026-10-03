import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import Theme from "vitepress/theme";
import Layout from "./Layout.vue";
import Landing from "./components/landing/Landing.vue";
import "./custom.css";

export default {
  extends: Theme,
  Layout: Layout,
  async enhanceApp({ app }) {
    enhanceAppWithTabs(app);
    app.component("Landing", Landing);

    import("@vercel/analytics").then(({ default: analytics }) => {
      analytics.inject();
    });
  },
};
