import { $ } from "zx";

const DATABASE_NAME = "safeql_prisma_demo";

async function main() {
  await $`psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);"`;
  await $`psql -U postgres -c "CREATE DATABASE ${DATABASE_NAME};"`;
  await $`pnpm prisma generate`;
  await $`pnpm prisma migrate deploy`;

  const { PrismaClient } = await import("@/prisma-client");
  const prisma = new PrismaClient();

  await prisma.user.createMany({
    data: [
      { name: "Alice", email: "alice@safeql.dev", createdAt: new Date("2021-01-01") },
      { name: "Bob", email: "bob@safeql.dev", createdAt: new Date("2021-01-02") },
      { name: "Charlie", email: "charlie@safeql.dev", createdAt: new Date("2021-01-03") },
    ],
  });

  await prisma.post.createMany({
    data: [
      { title: "Hello World", content: "Hello World", published: true, authorId: 1 },
      { title: "Foo Bar", content: "Foo Bar", published: true, authorId: 1 },
      { title: "Lorem Ipsum", content: "Lorem Ipsum", published: false, authorId: 2 },
    ],
  });

  console.log("✅ Seeded database");
}

main();
