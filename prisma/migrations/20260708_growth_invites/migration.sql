-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "registeredAt" TIMESTAMP(3),
ADD COLUMN     "registeredTenantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_inviteToken_key" ON "Lead"("inviteToken");

