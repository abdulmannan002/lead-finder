-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "MarketRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT,
    "remoteOk" BOOLEAN NOT NULL DEFAULT true,
    "budget" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "pitch" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketRequest_status_category_idx" ON "MarketRequest"("status", "category");

-- CreateIndex
CREATE INDEX "MarketRequest_tenantId_idx" ON "MarketRequest"("tenantId");

-- CreateIndex
CREATE INDEX "MarketResponse_tenantId_idx" ON "MarketResponse"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketResponse_requestId_tenantId_key" ON "MarketResponse"("requestId", "tenantId");

-- AddForeignKey
ALTER TABLE "MarketRequest" ADD CONSTRAINT "MarketRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResponse" ADD CONSTRAINT "MarketResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResponse" ADD CONSTRAINT "MarketResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MarketRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
