-- #542: Fahrer-App – schlankes Tourenmodell und Ereignis-Eingang (Konzept #513, Abschnitt 5, 6 und 8).
-- Bewusst schlank: Tourvorlagen, Planung und Büro-Oberfläche kommen mit #518 und bauen auf diesen Tabellen auf.
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_542.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_touren_542.sql (mehrfach ausführbar)
-- Braucht:        migration_fahrer_geraete_541.sql

SET NAMES utf8mb4;

-- Tour eines Tages. version steigt bei jeder Änderung durch das Büro; das Tablet lädt bei neuer Version neu.
-- geraet_id: Gerät, auf dem die Tour läuft (gesetzt mit tour.gestartet, umgesetzt mit #544).
CREATE TABLE IF NOT EXISTS fahrer_tour (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  datum          DATE         NOT NULL,
  bezeichnung    VARCHAR(120) NOT NULL,
  employee_id    INT          NOT NULL COMMENT 'Fahrer',
  fahrzeug       VARCHAR(40)  NULL     COMMENT 'z. B. RO-DR 101',
  status         ENUM('entwurf','freigegeben','unterwegs','beendet','storniert') NOT NULL DEFAULT 'entwurf',
  version        INT          NOT NULL DEFAULT 1,
  geraet_id      INT          NULL,
  gestartet_am   DATETIME     NULL COMMENT 'Gerätezeit aus tour.gestartet',
  beendet_am     DATETIME     NULL,
  beendet_durch  ENUM('fahrer','buero') NULL COMMENT 'buero = „Tour im Büro beenden“ (Notfall)',
  erstellt_von   INT          NULL,
  erstellt_am    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_fahrer_tour_fahrer_datum (employee_id, datum),
  KEY idx_fahrer_tour_datum (datum),
  CONSTRAINT fk_fahrer_tour_geraet FOREIGN KEY (geraet_id) REFERENCES fahrer_geraet(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stopp = ein Kunde auf der Tour. Kundendaten als Kopie, damit die Tour so bleibt, wie sie freigegeben wurde.
CREATE TABLE IF NOT EXISTS fahrer_stopp (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  tour_id        INT          NOT NULL,
  reihenfolge    INT          NOT NULL,
  auftrag_ref    VARCHAR(40)  NULL COMMENT 'Bestellung/Auftrag, z. B. B-24811',
  kunde_nr       VARCHAR(20)  NOT NULL COMMENT 'Lexware-Kundennummer (sonst SER)',
  kunde_name     VARCHAR(160) NOT NULL,
  kunde_adresse  VARCHAR(255) NULL,
  hinweise       VARCHAR(500) NULL,
  lieferzeit     VARCHAR(60)  NULL COMMENT 'z. B. „bis 11 Uhr“',
  status         ENUM('offen','beliefert','nicht_angetroffen','storniert') NOT NULL DEFAULT 'offen',
  KEY idx_fahrer_stopp_tour (tour_id, reihenfolge),
  CONSTRAINT fk_fahrer_stopp_tour FOREIGN KEY (tour_id) REFERENCES fahrer_tour(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bestellte Menge je Artikel (Soll). Artikel aus gas_artikel.
CREATE TABLE IF NOT EXISTS fahrer_stopp_position (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  stopp_id       INT          NOT NULL,
  artikel_nr     VARCHAR(16)  NOT NULL,
  soll_menge     DECIMAL(8,2) NOT NULL,
  KEY idx_fahrer_stopp_position_stopp (stopp_id),
  CONSTRAINT fk_fahrer_stopp_position_stopp FOREIGN KEY (stopp_id) REFERENCES fahrer_stopp(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jedes Ereignis aus der Outbox der App, auch abgelehnte (Büro sieht sie). uuid sorgt für Idempotenz.
-- payload = das Ereignis, wie es kam: Ein Beleg mit Unterschrift geht so nie verloren.
CREATE TABLE IF NOT EXISTS fahrer_ereignis (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid           CHAR(36)     NOT NULL,
  geraet_id      INT          NOT NULL,
  employee_id    INT          NOT NULL,
  typ            VARCHAR(40)  NOT NULL,
  lfd            INT          NULL     COMMENT 'Laufende Nummer pro Gerät',
  geraet_zeit    DATETIME(3)  NULL,
  tour_id        INT          NULL,
  stopp_id       INT          NULL,
  status         ENUM('ok','fehler') NOT NULL,
  fehler_code    VARCHAR(40)  NULL,
  fehler_text    VARCHAR(255) NULL,
  markierung     VARCHAR(40)  NULL     COMMENT 'z. B. nach_buero_ende, nach_uebergabe',
  payload        MEDIUMTEXT   NOT NULL,
  eingegangen_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fahrer_ereignis_uuid (uuid),
  KEY idx_fahrer_ereignis_geraet (geraet_id, lfd),
  KEY idx_fahrer_ereignis_tour (tour_id),
  KEY idx_fahrer_ereignis_status (status),
  CONSTRAINT fk_fahrer_ereignis_geraet FOREIGN KEY (geraet_id) REFERENCES fahrer_geraet(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lieferschein aus beleg.erstellt. Kein Fremdschlüssel auf Tour/Stopp: Der Beleg gilt auch, wenn die Tour storniert wird.
CREATE TABLE IF NOT EXISTS fahrer_beleg (
  ls_nummer        VARCHAR(20)  PRIMARY KEY COMMENT 'LS-<Kennung>-<lfd. Nr.>',
  ereignis_id      BIGINT       NOT NULL,
  geraet_id        INT          NOT NULL,
  employee_id      INT          NOT NULL,
  tour_id          INT          NULL,
  stopp_id         INT          NULL,
  kunde_nr         VARCHAR(20)  NULL,
  erstellt_am      DATETIME     NOT NULL COMMENT 'Gerätezeit',
  unterzeichner    VARCHAR(120) NULL,
  unterschrift_png MEDIUMTEXT   NULL COMMENT 'Base64',
  markierung       VARCHAR(40)  NULL,
  eingegangen_am   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fahrer_beleg_tour (tour_id),
  KEY idx_fahrer_beleg_kunde (kunde_nr),
  CONSTRAINT fk_fahrer_beleg_ereignis FOREIGN KEY (ereignis_id) REFERENCES fahrer_ereignis(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fahrer_beleg_position (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  ls_nummer    VARCHAR(20)  NOT NULL,
  artikel_nr   VARCHAR(16)  NULL,
  bezeichnung  VARCHAR(160) NOT NULL,
  soll         DECIMAL(8,2) NULL,
  geliefert    DECIMAL(8,2) NOT NULL DEFAULT 0,
  leergut      DECIMAL(8,2) NOT NULL DEFAULT 0,
  KEY idx_fahrer_beleg_position_ls (ls_nummer),
  CONSTRAINT fk_fahrer_beleg_position_ls FOREIGN KEY (ls_nummer) REFERENCES fahrer_beleg(ls_nummer) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Testtour bis #518 die Planung bringt (Mitarbeiter-ID und Artikel anpassen):
--   INSERT INTO fahrer_tour (datum, bezeichnung, employee_id, fahrzeug, status) VALUES (CURDATE(), 'Test Obing', 7, 'RO-DR 101', 'freigegeben');
--   INSERT INTO fahrer_stopp (tour_id, reihenfolge, auftrag_ref, kunde_nr, kunde_name, kunde_adresse, lieferzeit)
--     VALUES (LAST_INSERT_ID(), 1, 'B-TEST-1', '99999', 'Testkunde', 'Gewerbestr. 4, 83119 Obing', 'vormittags');
--   INSERT INTO fahrer_stopp_position (stopp_id, artikel_nr, soll_menge) VALUES (LAST_INSERT_ID(), '7801200', 2);
