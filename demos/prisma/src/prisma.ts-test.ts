import { Prisma, PrismaClient, PrismaPromise } from "@prisma/client";
import { assert, IsExact } from "conditional-type-checks";

type Nullable<T> = T | null;

function _test() {
  const prisma = new PrismaClient();

  () => {
    const raw = prisma.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM "User" LIMIT 1`);
    const orm = prisma.user.findMany({ select: { id: true }, take: 1 });

    assert<IsExact<typeof raw, PrismaPromise<{ id: number }[]>>>(true);
    assert<IsExact<typeof orm, PrismaPromise<{ id: number }[]>>>(true);
  };

  () => {
    const raw = prisma.$queryRaw<
      { id: number; createdAt: Date; email: string; name: Nullable<string> }[]
    >(Prisma.sql`SELECT * FROM "User"`);
    const orm = prisma.user.findMany();

    assert<IsExact<typeof raw, typeof orm>>(true);
  };

  () => {
    const email = "alice@safeql.dev";

    const raw = prisma.$queryRaw<{ id: number }[]>(
      Prisma.sql`SELECT id FROM "User" WHERE email = ${email} LIMIT 1`
    );
    const orm = prisma.user.findMany({ where: { email }, select: { id: true }, take: 1 });

    assert<IsExact<typeof raw, typeof orm>>(true);
  };
}

_test();
