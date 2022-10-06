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
          { text: "node-postgres (pg)", link: "/compatibility/node-postgres" },
        ],
      },
      {
        text: "@ts-safeql/sql-tag",
        items: [
          { text: "Introduction", link: "/libraries/sql-tag/introduction" },
          { text: "Installation", link: "/libraries/sql-tag/installation" },
          { text: "Usage", link: "/libraries/sql-tag/usage" },
        ],
      },
      {
        text: "API",
        items: [
          { text: "useConfigFile", link: "/api/index.md#useconfigfile" },
          {
            text: "connections",
            link: "/api/index.md#connections",
            items: [
              { text: "databaseUrl", link: "/api/index.md#connections-databaseurl" },
              { text: "migrationsDir", link: "/api/index.md#connections-migrationsdir" },
              { text: "connectionUrl", link: "/api/index.md#connections-connectionurl-optional" },
              { text: "databaseName", link: "/api/index.md#connections-databasename-optional" },
              { text: "tagName", link: "/api/index.md#connections-tagname" },
              { text: "name", link: "/api/index.md#connections-name" },
              { text: "operators", link: "/api/index.md#connections-operators" },
              { text: "transform", link: "/api/index.md#connections-transform-optional" },
              { text: "fieldTransform", link: "/api/index.md#connections-fieldtransform-optional" },
              { text: "keepAlive", link: "/api/index.md#connections-keepalive-optional" },
              { text: "overrides.types", link: "/api/index.md#connections-overrides-types-optional" },
            ],
          },
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
