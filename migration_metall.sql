-- #361 (16.10.2026): Metallkunden-Portal – Vorgänge, Belege, Merker, Dateien, Annahme-Protokoll, Eingang.
-- Entwurf und Entscheidungen: Repo randl-metall, docs/db-schema.md.
-- Ausführen: mysql -u radmin_randl_portal_user -p radmin_randl_portal < migration_metall.sql
--
-- Ein Vorgang = eine Bestellung (AB + LS/RE). Ein Angebot kann zu mehreren Vorgängen gehören:
-- AN hängt über metall_vorgang.angebot_beleg_id, AB/LS/RE über metall_beleg.vorgang_id.
-- Kundenkonten liegen in der gas-db (Postgres) → nur kdnr/kunden_konto_id als Text, kein Fremdschlüssel.

SET NAMES utf8mb4;

-- ── Metallkunden-Merker ───────────────────────────────────────────────────────
-- notiz_status: offen (METALL noch nicht in Lexware-Notiz) | ok | fehler
CREATE TABLE IF NOT EXISTS metall_kunde (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  lexware_kontakt_id   CHAR(36) NOT NULL UNIQUE,
  kdnr                 VARCHAR(50),
  name                 VARCHAR(255) NOT NULL,
  aktiv                TINYINT(1) NOT NULL DEFAULT 1,
  notiz_status         ENUM('offen','ok','fehler') NOT NULL DEFAULT 'offen',
  notiz_fehler         VARCHAR(500),
  notiz_geschrieben_am DATETIME,
  gesetzt_von          INT,
  erstellt_am          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_metall_kunde_kdnr (kdnr),
  FOREIGN KEY (gesetzt_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Nummernvergabe V-JJ-NNNN ──────────────────────────────────────────────────
-- INSERT INTO metall_vorgang_zaehler (jahr, letzte_nr) VALUES (?, LAST_INSERT_ID(1))
--   ON DUPLICATE KEY UPDATE letzte_nr = LAST_INSERT_ID(letzte_nr + 1);
-- SELECT LAST_INSERT_ID();
CREATE TABLE IF NOT EXISTS metall_vorgang_zaehler (
  jahr       SMALLINT PRIMARY KEY,
  letzte_nr  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Vorgänge ──────────────────────────────────────────────────────────────────
-- Status (Anfrage → Angebot → Auftrag → Fertigung → Lieferung → Rechnung) wird aus den Belegen
-- und fertigung_am berechnet, nicht gespeichert. Fremdschlüssel angebot_beleg_id unten (Kreisbezug).
CREATE TABLE IF NOT EXISTS metall_vorgang (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  vorgangsnummer      VARCHAR(20) NOT NULL UNIQUE,
  kunde_id            INT NOT NULL,
  kunden_bestellnr    VARCHAR(100),
  bezeichnung         VARCHAR(255) NOT NULL,
  herkunft            ENUM('buero','anfrage','nachbestellung','annahme') NOT NULL,
  angebot_beleg_id    INT,
  vorlage_vorgang_id  INT,
  fertigung_am        DATETIME,
  fertigung_von       INT,
  abgebrochen_am      DATETIME,
  abbruch_grund       VARCHAR(255),
  erstellt_von        INT,
  erstellt_am         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_metall_vorgang_kunde (kunde_id),
  INDEX idx_metall_vorgang_angebot (angebot_beleg_id),
  INDEX idx_metall_vorgang_bestellnr (kunden_bestellnr),
  FOREIGN KEY (kunde_id) REFERENCES metall_kunde(id),
  FOREIGN KEY (vorlage_vorgang_id) REFERENCES metall_vorgang(id) ON DELETE SET NULL,
  FOREIGN KEY (fertigung_von) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (erstellt_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Lexware-Belege AN/AB/LS/RE ────────────────────────────────────────────────
-- belegart/belegstatus im Lexware-Wortlaut (voucherType/voucherStatus).
-- zuordnung: offen (→ „Belege zuordnen“) | api (vom Portal angelegt) | verknuepfung (relatedVouchers)
--            | einleitung (Vorgangsnummer im Einleitungstext) | auto (#364) | manuell | ignoriert
-- vorgang_id nur für AB/LS/RE; Angebote hängen über metall_vorgang.angebot_beleg_id.
CREATE TABLE IF NOT EXISTS metall_beleg (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  lexware_id            CHAR(36) NOT NULL UNIQUE,
  belegart              ENUM('quotation','orderconfirmation','deliverynote','invoice') NOT NULL,
  belegnummer           VARCHAR(50),
  belegstatus           VARCHAR(30) NOT NULL,
  archiviert            TINYINT(1) NOT NULL DEFAULT 0,
  belegdatum            DATE,
  betrag_netto          DECIMAL(12,2),
  betrag_brutto         DECIMAL(12,2),
  lexware_kontakt_id    CHAR(36),
  lexware_version       INT,
  lexware_geaendert_am  DATETIME,
  einleitung_zeile      VARCHAR(255),
  vorgang_id            INT,
  zuordnung             ENUM('offen','api','verknuepfung','einleitung','auto','manuell','ignoriert') NOT NULL DEFAULT 'offen',
  vorschlag_vorgang_id  INT,
  zugeordnet_von        INT,
  zugeordnet_am         DATETIME,
  vom_portal_angelegt   TINYINT(1) NOT NULL DEFAULT 0,
  pdf_pfad              VARCHAR(500),
  sync_am               DATETIME,
  erstellt_am           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_metall_beleg_vorgang (vorgang_id),
  INDEX idx_metall_beleg_zuordnung (zuordnung),
  INDEX idx_metall_beleg_kontakt (lexware_kontakt_id),
  INDEX idx_metall_beleg_nummer (belegnummer),
  FOREIGN KEY (vorgang_id) REFERENCES metall_vorgang(id) ON DELETE SET NULL,
  FOREIGN KEY (vorschlag_vorgang_id) REFERENCES metall_vorgang(id) ON DELETE SET NULL,
  FOREIGN KEY (zugeordnet_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE metall_vorgang
  ADD CONSTRAINT fk_metall_vorgang_angebot FOREIGN KEY IF NOT EXISTS (angebot_beleg_id)
  REFERENCES metall_beleg(id) ON DELETE SET NULL;

-- ── relatedVouchers (direkte Nachbarn laut Lexware, ggf. noch nicht gesynct) ──
CREATE TABLE IF NOT EXISTS metall_beleg_bezug (
  beleg_id          INT NOT NULL,
  bezug_lexware_id  CHAR(36) NOT NULL,
  bezug_belegart    VARCHAR(30),
  PRIMARY KEY (beleg_id, bezug_lexware_id),
  INDEX idx_metall_beleg_bezug_ziel (bezug_lexware_id),
  FOREIGN KEY (beleg_id) REFERENCES metall_beleg(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Dateien und Fotos pro Vorgang ─────────────────────────────────────────────
-- pfad/vorschau_pfad relativ zu METALL_UPLOAD_DIR (.env, außerhalb von public_html).
-- Standard „nur intern“; Kunden-Uploads (quelle = 'kunde') legt der Code mit fuer_kunde_sichtbar = 1 an.
CREATE TABLE IF NOT EXISTS metall_datei (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  vorgang_id            INT NOT NULL,
  art                   ENUM('foto','pdf','zeichnung','cad','sonstiges') NOT NULL,
  dateiname             VARCHAR(255) NOT NULL,
  pfad                  VARCHAR(500) NOT NULL,
  vorschau_pfad         VARCHAR(500),
  mime_typ              VARCHAR(100) NOT NULL,
  groesse_bytes         BIGINT NOT NULL,
  beschreibung          VARCHAR(500),
  fuer_kunde_sichtbar   TINYINT(1) NOT NULL DEFAULT 0,
  sichtbar_geaendert_von INT,
  sichtbar_geaendert_am DATETIME,
  quelle                ENUM('mitarbeiter','kunde') NOT NULL DEFAULT 'mitarbeiter',
  hochgeladen_von       INT,
  hochgeladen_am        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geloescht_am          DATETIME,
  geloescht_von         INT,
  INDEX idx_metall_datei_vorgang (vorgang_id, fuer_kunde_sichtbar),
  FOREIGN KEY (vorgang_id) REFERENCES metall_vorgang(id),
  FOREIGN KEY (sichtbar_geaendert_von) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (hochgeladen_von) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (geloescht_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Protokoll Online-Annahme (nur INSERT, nie ändern) ─────────────────────────
-- Angebotsstand zum Zeitpunkt des Klicks; verbindlich ist erst die AB.
CREATE TABLE IF NOT EXISTS metall_annahme (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  vorgang_id               INT NOT NULL,
  angebot_beleg_id         INT NOT NULL,
  angebot_belegnummer      VARCHAR(50) NOT NULL,
  angebot_lexware_version  INT NOT NULL,
  angebot_betrag_brutto    DECIMAL(12,2) NOT NULL,
  angebot_pdf_sha256       CHAR(64),
  kunden_konto_id          VARCHAR(64) NOT NULL,
  kdnr                     VARCHAR(50) NOT NULL,
  kunden_bestellnr         VARCHAR(100),
  ip                       VARCHAR(45),
  user_agent               VARCHAR(500),
  angenommen_am            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_metall_annahme_vorgang (vorgang_id),
  FOREIGN KEY (vorgang_id) REFERENCES metall_vorgang(id),
  FOREIGN KEY (angebot_beleg_id) REFERENCES metall_beleg(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Eingang: Anfrage, Nachbestellung, Annahme, Freischaltung (Badge, #371) ────
CREATE TABLE IF NOT EXISTS metall_eingang (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  art               ENUM('anfrage','nachbestellung','annahme','freischaltung') NOT NULL,
  vorgang_id        INT,
  annahme_id        INT,
  kdnr              VARCHAR(50),
  kunden_konto_id   VARCHAR(64),
  nachricht         TEXT,
  status            ENUM('neu','erledigt','abgelehnt') NOT NULL DEFAULT 'neu',
  mail_gesendet_am  DATETIME,
  erledigt_von      INT,
  erledigt_am       DATETIME,
  erstellt_am       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_metall_eingang_status (status),
  FOREIGN KEY (vorgang_id) REFERENCES metall_vorgang(id),
  FOREIGN KEY (annahme_id) REFERENCES metall_annahme(id),
  FOREIGN KEY (erledigt_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
