-- CreateEnum
CREATE TYPE "ReplyOutcome" AS ENUM ('CALL_BOOKED', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "replyHandledAt" TIMESTAMP(3),
ADD COLUMN     "replyOutcome" "ReplyOutcome";
