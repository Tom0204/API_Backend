-- CreateTable
CREATE TABLE "game_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" VARCHAR(64) NOT NULL,
    "character_id" UUID NOT NULL,
    "combat_id" UUID,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_events_character_id_occurred_at_idx" ON "game_events"("character_id", "occurred_at");

-- CreateIndex
CREATE INDEX "game_events_combat_id_occurred_at_idx" ON "game_events"("combat_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "combats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts manuels (EVT-03, décision L5 D3) : invariants que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Données d'un événement : toujours un objet JSON
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_payload_object" CHECK (jsonb_typeof("payload") = 'object');

-- Type d'événement renseigné
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_type_not_blank" CHECK (length(trim("type")) > 0);
