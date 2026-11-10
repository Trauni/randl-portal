-- #533: Minijob-Flag. Minijobber haben ein Stundenlimit pro Monat statt Regeltage und kein Gleitzeitkonto.
-- Vorher Backup:  mariadb-dump radmin_randl_portal employees > employees_vor_minijob.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_minijob_533.sql (mehrfach ausführbar)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS minijob TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '#533 Minijob: Monatslimit statt Regeltage, kein Gleitzeitkonto',
  ADD COLUMN IF NOT EXISTS minijob_max_stunden_monat DECIMAL(5,2) NULL
    COMMENT '#533 Höchststunden pro Monat (nur bei minijob = 1)';
