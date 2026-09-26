-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "TournamentTeamRegistration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTeamRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentTeamRegistration_tournamentId_idx" ON "TournamentTeamRegistration"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentTeamRegistration_teamId_idx" ON "TournamentTeamRegistration"("teamId");

-- CreateIndex
CREATE INDEX "TournamentTeamRegistration_status_idx" ON "TournamentTeamRegistration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeamRegistration_tournamentId_teamId_key" ON "TournamentTeamRegistration"("tournamentId", "teamId");

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamRegistration" ADD CONSTRAINT "TournamentTeamRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamRegistration" ADD CONSTRAINT "TournamentTeamRegistration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
