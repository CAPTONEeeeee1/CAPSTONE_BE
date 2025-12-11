-- DropForeignKey
ALTER TABLE "public"."Workspace" DROP CONSTRAINT "Workspace_ownerId_fkey";

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
