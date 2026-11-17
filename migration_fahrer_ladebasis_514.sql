-- #514: Ladebasis fürs ADR-Beförderungspapier der Fahrer-App. Stammtabelle + Verweis an der Tour.
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_514.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_ladebasis_514.sql (mehrfach ausführbar)
-- Braucht:        migration_fahrer_touren_542.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS fahrer_ladebasis (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  adresse     VARCHAR(200) NULL COMMENT 'eine Zeile, z. B. Grünweg 1, 83370 Seeon; leer = noch nachzutragen',
  aktiv       TINYINT(1)   NOT NULL DEFAULT 1,
  sortierung  INT          NOT NULL DEFAULT 0,
  UNIQUE KEY uq_fahrer_ladebasis_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Startwerte (Stand 17.11.2026). Fehlende Adressen bleiben leer und werden im Portal nachgetragen.
INSERT IGNORE INTO fahrer_ladebasis (name, adresse, sortierung) VALUES
  ('Rimsting Tyczka',     NULL,                      10),
  ('Rimsting Drachengas', NULL,                      20),
  ('Hemhof',              'Rankhamerweg 15',         30),
  ('Seeon',               'Grünweg 1, 83370 Seeon',  40),
  ('Obing (neue Firma)',  NULL,                      50);

-- Spalte nur anlegen, wenn sie fehlt (MariaDB kennt ADD COLUMN IF NOT EXISTS).
ALTER TABLE fahrer_tour ADD COLUMN IF NOT EXISTS ladebasis_id INT NULL COMMENT 'Ladebasis der Tour (Fahrzeug ist nur Freitext)' AFTER fahrzeug;
ALTER TABLE fahrer_tour ADD INDEX IF NOT EXISTS idx_fahrer_tour_ladebasis (ladebasis_id);

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'fahrer_tour' AND CONSTRAINT_NAME = 'fk_fahrer_tour_ladebasis');
SET @sql := IF(@fk = 0,
  'ALTER TABLE fahrer_tour ADD CONSTRAINT fk_fahrer_tour_ladebasis FOREIGN KEY (ladebasis_id) REFERENCES fahrer_ladebasis(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
