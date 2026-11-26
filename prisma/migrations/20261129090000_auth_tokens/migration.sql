-- L6 : jetons d'accès et de rafraîchissement (AUTH-01), verrouillage après échecs de connexion (AUTH-03).

-- ---------------------------------------------------------------------------
-- Ajout manuel (L6 D2) : les sessions existantes n'ont ni jeton d'accès ni jeton de rafraîchissement.
-- Elles sont supprimées ; les joueurs se reconnectent.
-- ---------------------------------------------------------------------------
DELETE FROM "sessions";

-- DropIndex
DROP INDEX "sessions_token_hash_key";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_token_hash_hex";
ALTER TABLE "sessions" DROP COLUMN "token_hash",
ADD COLUMN     "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "access_token_hash" CHAR(64) NOT NULL,
ADD COLUMN     "revoked_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_access_token_hash_key" ON "sessions"("access_token_hash");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts manuels : invariants que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Compteur d'échecs jamais négatif
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_failed_login_count_non_negative" CHECK ("failed_login_count" >= 0);

-- Empreintes SHA-256 en hexadécimal minuscule
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_access_token_hash_hex" CHECK ("access_token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

-- Le jeton d'accès n'expire jamais après la famille
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_access_within_family" CHECK ("access_expires_at" <= "expires_at");
