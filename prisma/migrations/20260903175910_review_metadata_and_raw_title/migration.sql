-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "rawTitle" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "rejected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedNote" TEXT;

-- CreateIndex
CREATE INDEX "Product_rejected_confidence_idx" ON "Product"("rejected", "confidence");
