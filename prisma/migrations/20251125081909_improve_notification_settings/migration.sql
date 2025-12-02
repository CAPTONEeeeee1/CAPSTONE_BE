/*
  Warnings:

  - You are about to drop the column `invitationResponseEmail` on the `NotificationSetting` table. All the data in the column will be lost.
  - You are about to drop the column `taskAssignedEmail` on the `NotificationSetting` table. All the data in the column will be lost.
  - You are about to drop the column `workspaceInviteEmail` on the `NotificationSetting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "NotificationSetting" DROP COLUMN "invitationResponseEmail",
DROP COLUMN "taskAssignedEmail",
DROP COLUMN "workspaceInviteEmail",
ADD COLUMN     "boardCreated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskAssigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workspaceCreated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workspaceInvitationResponse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workspaceInvitations" BOOLEAN NOT NULL DEFAULT true;
