-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_classes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "base_hp" INTEGER NOT NULL,
    "base_mana" INTEGER NOT NULL,
    "base_attack" INTEGER NOT NULL,
    "base_defense" INTEGER NOT NULL,
    "base_speed" INTEGER NOT NULL,
    "hp_per_level" INTEGER NOT NULL,
    "mana_per_level" INTEGER NOT NULL,
    "attack_per_level" INTEGER NOT NULL,
    "defense_per_level" INTEGER NOT NULL,
    "speed_per_level" INTEGER NOT NULL,

    CONSTRAINT "character_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "min_level" INTEGER NOT NULL,
    "max_level" INTEGER NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monster_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(32) NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "level" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "attack" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "xp_reward" INTEGER NOT NULL,
    "loot_item_id" UUID,
    "loot_chance" DOUBLE PRECISION,

    CONSTRAINT "monster_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" VARCHAR(16) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "sessions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_classes_code_key" ON "character_classes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "monster_templates_code_key" ON "monster_templates"("code");

-- CreateIndex
CREATE INDEX "monster_templates_zone_id_idx" ON "monster_templates"("zone_id");

-- CreateIndex
CREATE INDEX "characters_account_id_idx" ON "characters"("account_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monster_templates" ADD CONSTRAINT "monster_templates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monster_templates" ADD CONSTRAINT "monster_templates_loot_item_id_fkey" FOREIGN KEY ("loot_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "character_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts manuels (ARCH-03) : invariants simples, que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Comptes et sessions
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_after_creation" CHECK ("expires_at" > "created_at");

-- Classes (rules.md §3) : statistiques de niveau 1 positives, gains positifs ou nuls
ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_base_stats_positive"
    CHECK ("base_hp" > 0 AND "base_mana" >= 0 AND "base_attack" > 0 AND "base_defense" >= 0 AND "base_speed" > 0);
ALTER TABLE "character_classes" ADD CONSTRAINT "character_classes_gains_non_negative"
    CHECK ("hp_per_level" >= 0 AND "mana_per_level" >= 0 AND "attack_per_level" >= 0
       AND "defense_per_level" >= 0 AND "speed_per_level" >= 0);

-- Zones et monstres (rules.md §8)
ALTER TABLE "zones" ADD CONSTRAINT "zones_level_range" CHECK ("min_level" >= 1 AND "max_level" >= "min_level");
ALTER TABLE "monster_templates" ADD CONSTRAINT "monster_templates_stats_positive"
    CHECK ("level" >= 1 AND "hp" > 0 AND "attack" > 0 AND "defense" >= 0 AND "speed" > 0 AND "xp_reward" >= 1);
ALTER TABLE "monster_templates" ADD CONSTRAINT "monster_templates_loot_chance_range"
    CHECK ("loot_chance" IS NULL OR ("loot_chance" >= 0 AND "loot_chance" <= 1));
ALTER TABLE "monster_templates" ADD CONSTRAINT "monster_templates_loot_complete"
    CHECK (("loot_item_id" IS NULL) = ("loot_chance" IS NULL));

-- Personnages (rules.md §4 et §5)
ALTER TABLE "characters" ADD CONSTRAINT "characters_name_format" CHECK ("name" ~ '^[A-Za-z]{3,16}$');
ALTER TABLE "characters" ADD CONSTRAINT "characters_level_range" CHECK ("level" BETWEEN 1 AND 10);
ALTER TABLE "characters" ADD CONSTRAINT "characters_experience_non_negative" CHECK ("experience" >= 0);
ALTER TABLE "characters" ADD CONSTRAINT "characters_max_level_without_experience" CHECK ("level" < 10 OR "experience" = 0);

-- Nom unique sans tenir compte de la casse (rules.md §4)
CREATE UNIQUE INDEX "characters_name_lower_key" ON "characters" (lower("name"));
