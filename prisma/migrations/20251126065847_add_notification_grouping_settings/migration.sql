DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emaildigestfrequency') THEN
        CREATE TYPE "EmailDigestFrequency" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'NEVER');
    END IF;
END$$;

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailDigestFrequency" "EmailDigestFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "inAppGroupingEnabled" BOOLEAN NOT NULL DEFAULT true;
