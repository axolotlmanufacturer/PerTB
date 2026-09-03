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

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

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
