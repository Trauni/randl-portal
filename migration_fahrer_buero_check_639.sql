-- #639: Büro-Check an der beendeten Tour. Das Büro bestätigt, dass das Fahrzeug abgeladen ist; die Tour gilt damit
-- als erledigt und der Fahrzeugbestand als 0. Kein neuer Status: Die Fahrer-App kennt nur entwurf bis storniert.
-- Ausführen: mariadb radmin_randl_portal < migration_fahrer_buero_check_639.sql (mehrfach ausführbar)

SET NAMES utf8mb4;

ALTER TABLE fahrer_tour
  ADD COLUMN IF NOT EXISTS buero_check_am  DATETIME     NULL COMMENT 'Büro-Check: Fahrzeug abgeladen, Tour erledigt (#639)' AFTER beendet_durch,
  ADD COLUMN IF NOT EXISTS buero_check_von VARCHAR(120) NULL COMMENT 'Name aus der Portal-Sitzung' AFTER buero_check_am;
