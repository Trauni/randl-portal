-- #518: Tourvorlagen (Fahrer + Stammkunden in fester Reihenfolge).
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_518_vorlagen.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_vorlagen_518.sql (mehrfach ausführbar)
-- Braucht:        migration_fahrer_touren_542.sql, migration_fahrer_ladebasis_514.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS fahrer_tour_vorlage (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL COMMENT 'z. B. Montag Standard Rosenheim',
  employee_id  INT          NOT NULL COMMENT 'Fahrer',
  fahrzeug     VARCHAR(40)  NULL,
  ladebasis_id INT          NULL,
  erstellt_am  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fahrer_tour_vorlage_name (name),
  CONSTRAINT fk_fahrer_tour_vorlage_ladebasis FOREIGN KEY (ladebasis_id) REFERENCES fahrer_ladebasis(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kunde = Lexware-Kundennummer (wie fahrer_stopp.kunde_nr); der Name ist nur Anzeige.
CREATE TABLE IF NOT EXISTS fahrer_tour_vorlage_kunde (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  vorlage_id  INT          NOT NULL,
  reihenfolge INT          NOT NULL,
  kunde_nr    VARCHAR(20)  NOT NULL,
  kunde_name  VARCHAR(160) NOT NULL,
  lieferzeit  VARCHAR(60)  NULL COMMENT 'Standard, wenn die Bestellung keine hat',
  hinweise    VARCHAR(500) NULL,
  KEY idx_fahrer_tour_vorlage_kunde (vorlage_id, reihenfolge),
  CONSTRAINT fk_fahrer_tour_vorlage_kunde FOREIGN KEY (vorlage_id) REFERENCES fahrer_tour_vorlage(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
