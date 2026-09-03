import { defineConfig } from 'prisma/config';

/**
 * `prisma generate` needs no connection string, but declaring the datasource
 * unconditionally made it resolve DATABASE_URL eagerly — which meant
 * `pnpm install` (via the postinstall generate) failed on a fresh clone and on
 * any build where the connection string is a runtime-only secret.
 *
 * Declared only when it is actually set. Migrate and introspect still report a
 * missing datasource clearly, because they need one and generate does not.
 */
const databaseUrl = process.env.DATABASE_URL;

/**
 * Prisma 7 moved the datasource URL out of schema.prisma and into this file.
 * The schema no longer carries `url = env("DATABASE_URL")`; migration and
 * introspection commands read the connection string from here instead.
 *
 * At runtime the client is constructed with an adapter rather than a URL —
 * on Vercel that is the Neon serverless driver adapter, which together with
 * the globalThis singleton is what stops Prisma exhausting connections on
 * serverless (known trap 3). That wiring lands with src/lib/db.ts in Phase 2.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
