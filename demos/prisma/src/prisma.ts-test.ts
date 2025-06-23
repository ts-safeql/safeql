import { PrismaClient, PrismaPromise } from "@/prisma-client";
import { assert, IsExact } from "conditional-type-checks";

/**
 * Performs compile-time type assertions to verify that the result types of raw SQL queries and equivalent Prisma ORM queries are identical.
 *
 * This function checks type equivalence for various query patterns on the "User" table, ensuring that raw and ORM-based queries yield the same TypeScript types.
 */
function _test() {
  const prisma = new PrismaClient();

  () => {
    const raw = prisma.$queryRaw<{ id: number }[]>`SELECT id FROM "User" LIMIT 1`;
    const orm = prisma.user.findMany({ select: { id: true }, take: 1 });

    assert<IsExact<typeof raw, PrismaPromise<{ id: number }[]>>>(true);
    assert<IsExact<typeof orm, PrismaPromise<{ id: number }[]>>>(true);
  };

  () => {
    const raw = prisma.$queryRaw<
      { id: number; createdAt: Date; email: string; name: string | null }[]
    >`SELECT * FROM "User"`;
    const orm = prisma.user.findMany();

    assert<IsExact<typeof raw, typeof orm>>(true);
  };

  () => {
    const email = "alice@safeql.dev";

    const raw = prisma.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "User" WHERE email = ${email} LIMIT 1`;
    const orm = prisma.user.findMany({ where: { email }, select: { id: true }, take: 1 });

    assert<IsExact<typeof raw, typeof orm>>(true);
  };
}

_test();
