-- CreateEnum
CREATE TYPE "Technology" AS ENUM ('hdd_cmr', 'hdd_smr', 'sshd', 'ssd_tlc', 'ssd_qlc', 'ssd_mlc');

-- CreateEnum
CREATE TYPE "FormFactor" AS ENUM ('3.5', '2.5', 'm2_2280', 'm2_2230', 'u2', 'ext_desktop', 'ext_portable');

-- CreateEnum
CREATE TYPE "Interface" AS ENUM ('sata3', 'sas12', 'pcie3', 'pcie4', 'pcie5', 'usb_g1', 'usb_g2', 'usb_g2x2');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('new', 'renewed', 'used');

-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('amazon', 'ebay');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacityBytes" BIGINT NOT NULL,
    "technology" "Technology",
    "formFactor" "FormFactor",
    "interface" "Interface",
    "rpm" INTEGER,
    "mpn" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "shuckable" BOOLEAN NOT NULL DEFAULT false,
    "shuckedEquivalent" TEXT,
    "dictionaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "externalId" TEXT NOT NULL,
    "condition" "Condition" NOT NULL,
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "shippingIsCalculated" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "sellerName" TEXT,
    "sellerScore" DOUBLE PRECISION,
    "powerOnHours" INTEGER,
    "hasWarranty" BOOLEAN,
    "returnPolicy" TEXT,
    "url" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_technology_formFactor_interface_idx" ON "Product"("technology", "formFactor", "interface");

-- CreateIndex
CREATE INDEX "Product_confidence_idx" ON "Product"("confidence");

-- CreateIndex
CREATE INDEX "Product_shuckable_idx" ON "Product"("shuckable");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brand_model_capacityBytes_key" ON "Product"("brand", "model", "capacityBytes");

-- CreateIndex
CREATE INDEX "Offer_expiresAt_idx" ON "Offer"("expiresAt");

-- CreateIndex
CREATE INDEX "Offer_productId_condition_idx" ON "Offer"("productId", "condition");

-- CreateIndex
CREATE INDEX "Offer_inStock_idx" ON "Offer"("inStock");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_marketplace_externalId_key" ON "Offer"("marketplace", "externalId");

-- CreateIndex
CREATE INDEX "PricePoint_offerId_observedAt_idx" ON "PricePoint"("offerId", "observedAt");

-- CreateIndex
CREATE INDEX "PricePoint_observedAt_idx" ON "PricePoint"("observedAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
