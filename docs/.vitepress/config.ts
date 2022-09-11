import { defineConfig } from "vitepress";

export default defineConfig({
  title: "SafeQL",
  description: "Write SQL queries with confidence!",
  themeConfig: {
    editLink: {
      pattern: "https://github.com/ts-safeql/safeql/tree/main/docs/:path",
    },
    logo: "/ts-logo.svg",
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Configuration", link: "/guide/configuration" },
        ],
      },
      {
        text: "Compatibility",
        items: [
          { text: "Prisma", link: "/compatibility/prisma" },
          { text: "Sequelize", link: "/compatibility/sequelize" },
          { text: "Postgres.js", link: "/compatibility/postgres.js" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/ts-safeql/safeql",
      },
      {
        icon: "twitter",
        link: "https://twitter.com/CoEliya",
      },
    ],
  },
});
