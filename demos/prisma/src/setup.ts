import { execSync } from "child_process";
import { config } from "dotenv";
import path from "path";

config({ path: path.join(__dirname, "..", ".env") });

const DATABASE_NAME = "safeql_prisma_demo";

async function main() {
  execSync(`psql -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);"`);
  execSync(`psql -U postgres -c "CREATE DATABASE ${DATABASE_NAME};"`);
  execSync(`pnpm prisma generate`, { stdio: "inherit" });
  execSync(`pnpm prisma migrate deploy`, { stdio: "inherit" });

  const { PrismaClient } = await import("@prisma/client");
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
