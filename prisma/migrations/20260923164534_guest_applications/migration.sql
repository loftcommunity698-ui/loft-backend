-- DropForeignKey
ALTER TABLE "JobApplication" DROP CONSTRAINT "JobApplication_userId_fkey";

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "guestName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("clerkId") ON DELETE SET NULL ON UPDATE CASCADE;
