-- #491 (09.11.2026): Urlaubsbemessung (13-Wochen-Schnitt) aus der Portal-Zeiterfassung.
-- Ausführen: mariadb radmin_randl_portal < migration_urlaub_bemessung_491.sql (mehrfach ausführbar)
--
-- Das Portal ist die Akte für Urlaub. Rentman ist nur noch Spiegel und darf fehlen.
-- Dafür müssen Berechnung und Nachweis vollständig im Portal liegen und dürfen nicht
-- an einer Rentman-ID hängen. Aufbewahrung: Zeilen werden nie gelöscht, nur ergänzt.

-- 1. Woher der Schnitt kam: portal | rentman | vertrag (vereinbarte Tagesarbeitszeit,
--    wenn im Fenster keine Arbeitszeit lag). Ohne diese Spalte wäre ein alter Wert nicht prüfbar.
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS bemessung_quelle VARCHAR(10) NULL
    COMMENT '#491 portal | rentman | vertrag';

-- 2. Urlaubstage ohne Rentman-Zeiteintrag zulassen. Der Spaltentyp bleibt, wie er ist;
--    nur NOT NULL fällt weg. UNIQUE-Indizes dürfen mehrere NULL enthalten.
SET @typ = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vacation_request_days'
               AND COLUMN_NAME = 'rentman_timeregistration_id');
SET @sql = IF(@typ IS NULL, 'SELECT 1',
              CONCAT('ALTER TABLE vacation_request_days MODIFY rentman_timeregistration_id ', @typ, ' NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
