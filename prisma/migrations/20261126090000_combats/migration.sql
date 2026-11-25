-- CreateEnum
CREATE TYPE "combat_status" AS ENUM ('IN_PROGRESS', 'VICTORY', 'DEFEAT');

-- CreateTable
CREATE TABLE "combats" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "character_id" UUID NOT NULL,
    "monster_template_id" UUID NOT NULL,
    "status" "combat_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "character_max_hp" INTEGER NOT NULL,
    "character_hp" INTEGER NOT NULL,
    "character_attack" INTEGER NOT NULL,
    "character_defense" INTEGER NOT NULL,
    "character_speed" INTEGER NOT NULL,
    "monster_max_hp" INTEGER NOT NULL,
    "monster_hp" INTEGER NOT NULL,
    "monster_attack" INTEGER NOT NULL,
    "monster_defense" INTEGER NOT NULL,
    "monster_speed" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "combats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "combats_character_id_idx" ON "combats"("character_id");

-- AddForeignKey
ALTER TABLE "combats" ADD CONSTRAINT "combats_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combats" ADD CONSTRAINT "combats_monster_template_id_fkey" FOREIGN KEY ("monster_template_id") REFERENCES "monster_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts manuels (COMBAT-01 à COMBAT-03, décision L3 D3) : invariants que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Statistiques figées valides (rules.md §6)
ALTER TABLE "combats" ADD CONSTRAINT "combats_character_stats_valid"
    CHECK ("character_max_hp" > 0 AND "character_attack" > 0 AND "character_defense" >= 0 AND "character_speed" > 0);
ALTER TABLE "combats" ADD CONSTRAINT "combats_monster_stats_valid"
    CHECK ("monster_max_hp" > 0 AND "monster_attack" > 0 AND "monster_defense" >= 0 AND "monster_speed" > 0);

-- PV courants bornés entre 0 et le maximum
ALTER TABLE "combats" ADD CONSTRAINT "combats_character_hp_range" CHECK ("character_hp" BETWEEN 0 AND "character_max_hp");
ALTER TABLE "combats" ADD CONSTRAINT "combats_monster_hp_range" CHECK ("monster_hp" BETWEEN 0 AND "monster_max_hp");

-- Statut cohérent avec les PV et la date de fin (rules.md §7 : VICTORY et DEFEAT sont terminaux)
ALTER TABLE "combats" ADD CONSTRAINT "combats_status_consistent" CHECK (
    ("status" = 'IN_PROGRESS' AND "finished_at" IS NULL AND "character_hp" > 0 AND "monster_hp" > 0)
    OR ("status" = 'VICTORY' AND "finished_at" IS NOT NULL AND "monster_hp" = 0 AND "character_hp" > 0)
    OR ("status" = 'DEFEAT' AND "finished_at" IS NOT NULL AND "character_hp" = 0)
);

-- Un seul combat IN_PROGRESS par personnage (rules.md §6), en plus du verrou sur le personnage
CREATE UNIQUE INDEX "combats_one_in_progress_per_character" ON "combats" ("character_id") WHERE "status" = 'IN_PROGRESS';
