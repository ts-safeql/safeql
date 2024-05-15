import { PrismaClient } from "@/prisma-client";
import assert from "assert";

async function run() {
  const prisma = new PrismaClient();

  test(`SELECT id FROM "User" LIMIT 1`, async () => {
    return assert.deepEqual(
      await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM "User" LIMIT 1`,
      await prisma.user.findMany({ select: { id: true }, take: 1 }),
    );
  });

  test(`SELECT * FROM "User"`, async () => {
    return assert.deepEqual(
      await prisma.$queryRaw<
        { id: number; createdAt: Date; email: string; name: string | null }[]
      >`SELECT * FROM "User"`,
      await prisma.user.findMany(),
    );
  });
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.log(`❌ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

run();
