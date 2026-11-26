-- L7 : permissions en masque de bits (ROLE-01), suspension des comptes (ROLE-03).
-- Les comptes existants reçoivent le rôle joueur (1 = PLAY) par la valeur par défaut.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "permissions" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3);

-- ---------------------------------------------------------------------------
-- Ajouts manuels : invariants que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Seuls les 4 flags connus (bits 0 à 3, src/contexts/identity/domain/permissions.ts) ; exclut aussi les négatifs
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_permissions_known_bits" CHECK (("permissions" & ~15) = 0);
