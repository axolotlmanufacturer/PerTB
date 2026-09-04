-- Price history hangs off the PRODUCT, not the offer.
--
-- Offers are hard-deleted the moment they expire (CLAUDE.md §1.3), and
-- PricePoint used to cascade from them — so a series could never outlive the
-- listing that produced it. The 90-day window was really "as long as this eBay
-- item stayed unsold", and the 18-month retention pass had almost nothing to
-- bite on.
--
-- Written by hand rather than generated, because the generated version adds
-- four NOT NULL columns with no backfill and fails on any populated table.

-- 1. Add the columns nullable, so existing rows survive the statement.
ALTER TABLE "PricePoint"
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "offerKey"  TEXT,
  ADD COLUMN "condition" "Condition",
  ADD COLUMN "lotSize"   INTEGER NOT NULL DEFAULT 1;

-- 2. Backfill from the offer each observation currently hangs off. lotSize and
--    condition are denormalised here on purpose: once the offer is gone they
--    are the only record of how the observation should be priced.
UPDATE "PricePoint" p
SET "productId" = o."productId",
    "offerKey"  = o."id",
    "condition" = o."condition",
    "lotSize"   = o."lotSize"
FROM "Offer" o
WHERE p."offerId" = o."id";

-- 3. Anything the backfill could not attribute has no product and cannot be
--    read. There should be none — the old cascade removed them with the offer —
--    but step 4 must not fail on a surprise.
DELETE FROM "PricePoint" WHERE "productId" IS NULL;

-- 4. Now the columns can carry their real constraints.
ALTER TABLE "PricePoint"
  ALTER COLUMN "productId" SET NOT NULL,
  ALTER COLUMN "offerKey"  SET NOT NULL,
  ALTER COLUMN "condition" SET NOT NULL;

-- 5. Drop the link that caused the problem.
ALTER TABLE "PricePoint" DROP CONSTRAINT "PricePoint_offerId_fkey";
DROP INDEX "PricePoint_offerId_observedAt_idx";
ALTER TABLE "PricePoint" DROP COLUMN "offerId";

-- 6. Read paths group by (product, condition) and reconstruct a step function
--    per offerKey, so those are the indexes that matter.
CREATE INDEX "PricePoint_productId_condition_observedAt_idx"
  ON "PricePoint"("productId", "condition", "observedAt");
CREATE INDEX "PricePoint_offerKey_idx" ON "PricePoint"("offerKey");

ALTER TABLE "PricePoint"
  ADD CONSTRAINT "PricePoint_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
