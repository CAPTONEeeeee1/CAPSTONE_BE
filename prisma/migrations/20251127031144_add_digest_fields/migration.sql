-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "lastDigestSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_receiverId_emailedAt_idx" ON "Notification"("receiverId", "emailedAt");
