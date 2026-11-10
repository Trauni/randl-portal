-- Profil-Einstellung "Automatisch 30 Minuten Pause buchen" (pro Mitarbeiter, Standard: an).
-- Wirkung: Pausenfeld der manuellen Erfassung ist mit 30 vorbelegt; beim Ausstempeln werden
-- mindestens 30 Minuten Pause gebucht, wenn der Eintrag länger als 6 Stunden dauert.
-- Vorher Backup:  mariadb-dump radmin_randl_portal employees > employees_vor_auto_pause.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_auto_pause_30_530.sql (mehrfach ausführbar)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS auto_pause_30 TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Automatisch 30 Minuten Pause buchen (Profil)';
