-- CreateEnum
CREATE TYPE "EmailConfidence" AS ENUM ('HIGH', 'LOW');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "emailConfidence" "EmailConfidence";
