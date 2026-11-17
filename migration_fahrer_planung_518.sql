-- #518: Tourplanung im Büro. Bestellung (Shop-Postgres) ↔ Stopp, damit eine Bestellung nur in einer aktiven Tour steckt.
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_518.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_planung_518.sql (mehrfach ausführbar)
-- Braucht:        migration_fahrer_touren_542.sql

SET NAMES utf8mb4;

-- bestell_id: UUID aus webshop_orders (liegt in einer anderen Datenbank, daher kein Fremdschlüssel).
-- bestell_sperre: dieselbe UUID, solange der Stopp die Bestellung belegt; NULL = Bestellung wieder frei.
-- UNIQUE erlaubt mehrere NULL, so reicht ein normaler Index für „nur in einer aktiven Tour“.
ALTER TABLE fahrer_stopp ADD COLUMN IF NOT EXISTS bestell_id     CHAR(36) NULL COMMENT 'webshop_orders.id' AFTER auftrag_ref;
ALTER TABLE fahrer_stopp ADD COLUMN IF NOT EXISTS bestell_sperre CHAR(36) NULL COMMENT 'wie bestell_id, NULL sobald die Tour storniert ist' AFTER bestell_id;
ALTER TABLE fahrer_stopp ADD UNIQUE INDEX IF NOT EXISTS uq_fahrer_stopp_bestell_sperre (bestell_sperre);
ALTER TABLE fahrer_stopp ADD INDEX IF NOT EXISTS idx_fahrer_stopp_bestell (bestell_id);
