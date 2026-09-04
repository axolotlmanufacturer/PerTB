import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * Known trap 3: Prisma on serverless exhausts connections without pooling. Two
 * things stop that here —
 *
 *   1. The Neon serverless driver adapter in production, which multiplexes over
 *      HTTP/WebSocket instead of holding a Postgres connection per invocation.
 *   2. The globalThis singleton, so dev-mode HMR does not open a fresh pool on
 *      every reload.
 *
 * Prisma 7 takes an adapter rather than a datasource URL, so the choice of
 * driver is made here rather than in schema.prisma.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local, or run `pnpm db:up` for a local Postgres.',
    );
  }
  return url;
}

/** Neon hosts speak the serverless protocol; anything else is plain Postgres. */
export function isNeon(url: string): boolean {
  return /\.neon\.tech|neon\.database|pooler\.[^/]*neon/i.test(url);
}

function createClient(): PrismaClient {
  const url = connectionString();

  // In production this is Neon. Locally it is the docker-compose Postgres, and
  // node-postgres is the right driver for that — the Neon adapter cannot talk
  // to a plain Postgres endpoint.
  const adapter = isNeon(url)
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  // One client per process: the HMR singleton in dev, and one per lambda in
  // production, which is what the Neon adapter expects.
  const created = createClient();
  globalForPrisma.prisma = created;
  return created;
}

/**
 * Constructed LAZILY, on first actual use.
 *
 * `next build` collects page data by importing every route module. Building
 * the client at import time made the whole build require a live DATABASE_URL —
 * a build should not need a database, and on Vercel the connection string is a
 * runtime secret rather than a build input.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * THE 24-HOUR RULE, as a reusable predicate.
 *
 * Every read path filters on this. Amazon's Operating Agreement requires
 * displayed prices be refreshed or removed within 24 hours, and that is
 * enforced structurally — by this filter plus the hard-delete pass in the
 * ingest job — not by a comment or a cron someone hopes is running.
 *
 * If ingest breaks for two days the table empties. That is correct behaviour.
 * Do not add a grace period here.
 */
export function liveOfferWhere(now: Date = new Date()) {
  return { expiresAt: { gt: now } };
}
