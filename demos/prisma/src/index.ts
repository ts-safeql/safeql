import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  const [r2] = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM "User" LIMIT 1`;
  const r1 = await prisma.user.findFirst({ select: { id: true } });

  console.log({ r1, r2 });
}

main();
