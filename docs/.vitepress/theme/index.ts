import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import "./custom.css";

export default {
  ...DefaultTheme,
  Layout: Layout,
};
