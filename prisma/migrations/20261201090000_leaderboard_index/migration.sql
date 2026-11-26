-- CreateIndex
CREATE INDEX "characters_leaderboard_idx" ON "characters"("level" DESC, "experience" DESC, "created_at", "id");
