import { defineConfig, env } from 'prisma/config';

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
  datasource: {
    url: env('DATABASE_URL'),
  },
});
