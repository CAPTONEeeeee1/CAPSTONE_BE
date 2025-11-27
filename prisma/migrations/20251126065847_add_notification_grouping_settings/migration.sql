-- CreateEnum
CREATE TYPE "EmailDigestFrequency" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'NEVER');

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailDigestFrequency" "EmailDigestFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "inAppGroupingEnabled" BOOLEAN NOT NULL DEFAULT true;
