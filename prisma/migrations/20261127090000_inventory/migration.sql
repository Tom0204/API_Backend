-- CreateTable
CREATE TABLE "inventory_items" (
    "character_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("character_id","item_id")
);

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajout manuel (INV-01, décision L4 D1) : invariant que Prisma ne sait pas décrire.
-- ---------------------------------------------------------------------------

-- Une pile contient au moins un objet ; aucune limite haute (rules.md §10)
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_quantity_positive" CHECK ("quantity" > 0);
