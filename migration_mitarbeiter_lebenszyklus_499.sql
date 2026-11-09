-- #499 (Epic #498): Portal als führendes System für Mitarbeiter.
-- Vorher Backup:  mysqldump radmin_randl_portal employees > employees_vor_499.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_mitarbeiter_lebenszyklus_499.sql (mehrfach ausführbar)
-- authentik_uid und rentman_id gibt es bereits; neu sind status und is_demo.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS status ENUM('aktiv','inaktiv') NOT NULL DEFAULT 'aktiv'
    COMMENT '#499 inaktiv = deaktiviert (Daten bleiben)',
  ADD COLUMN IF NOT EXISTS is_demo TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '#499 Demo-Mitarbeiter: von Sync und Auswertungen ausgenommen';
