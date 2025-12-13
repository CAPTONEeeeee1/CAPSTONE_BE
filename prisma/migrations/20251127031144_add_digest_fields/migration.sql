-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "lastDigestSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_receiverId_emailedAt_idx" ON "Notification"("receiverId", "emailedAt");

-- CreateEnum
CREATE TYPE "EmailDigestFrequency" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'NEVER');

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN "workspaceCreated" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationSetting" ADD COLUMN "boardDeleted" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationSetting" ADD COLUMN "inAppGroupingEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationSetting" ADD COLUMN "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "NotificationSetting" ADD COLUMN "emailDigestFrequency" "EmailDigestFrequency" NOT NULL DEFAULT 'DAILY';