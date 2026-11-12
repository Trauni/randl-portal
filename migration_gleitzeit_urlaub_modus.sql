-- Gleitzeitkonto: Urlaubsstunden statt 13-Wochen-Schnitt.
-- 'soll'  = Tages-Soll (Wochenstunden / Arbeitstage), Konto bleibt ausgeglichen (Standard)
-- 'keine' = Urlaubstage tragen keine Stunden
-- Ausführen: mariadb radmin_randl_portal < migration_gleitzeit_urlaub_modus.sql (mehrfach ausführbar)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gleitzeit_urlaub_modus ENUM('soll','keine') NOT NULL DEFAULT 'soll'
    COMMENT 'Urlaubsstunden bei aktivem Gleitzeitkonto';

-- Bei Gleitzeit-Urlaub gibt es kein Bemessungsfenster.
SET @sql = (SELECT IF(COUNT(*) = 0, 'SELECT 1', 'ALTER TABLE vacation_requests MODIFY bemessung_von DATE NULL, MODIFY bemessung_bis DATE NULL')
              FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vacation_requests'
               AND COLUMN_NAME = 'bemessung_von' AND DATA_TYPE = 'date');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
