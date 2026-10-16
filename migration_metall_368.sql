-- #368 (16.10.2026): Vorgangsdetail – Fertigung in drei Stufen, Beleg vom Vorgang lösen.
-- Ausführen: mariadb radmin_randl_portal < migration_metall_368.sql (mehrfach ausführbar)
--
-- Fertigung: Geplant (beide NULL) → In Arbeit (fertigung_begonnen_am) → Fertig (fertigung_am).
-- fertigung_von = wer zuletzt geändert hat.
-- gesperrt_vorgang_id: Das Büro hat den Beleg von diesem Vorgang gelöst. Der Sync ordnet ihn
-- dort nicht mehr automatisch zu (sonst hinge er nach 15 Minuten wieder am selben Vorgang).

ALTER TABLE metall_vorgang
  ADD COLUMN IF NOT EXISTS fertigung_begonnen_am DATETIME NULL AFTER vorlage_vorgang_id;

ALTER TABLE metall_beleg
  ADD COLUMN IF NOT EXISTS gesperrt_vorgang_id INT NULL AFTER vorschlag_vorgang_id;
