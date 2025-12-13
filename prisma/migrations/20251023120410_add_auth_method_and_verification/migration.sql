-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authMethod" TEXT NOT NULL DEFAULT 'email',
ADD COLUMN     "verificationToken" TEXT;
