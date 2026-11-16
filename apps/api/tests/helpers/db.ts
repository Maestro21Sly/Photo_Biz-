import { prisma } from "../../src/db.js";

let tableNames: string[] | null = null;

/**
 * Truncate every application table between tests.
 *
 * Deliberately hitting the real database rather than a mocked Prisma client:
 * TRUNCATE ... CASCADE only works because the FK graph the migrations created is
 * actually correct, so this doubles as a check on the schema itself.
 */
export async function resetDb(): Promise<void> {
  if (!tableNames) {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    tableNames = rows.map((r) => `"public"."${r.tablename}"`);
  }
  if (tableNames.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
