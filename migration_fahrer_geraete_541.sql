-- #541: Fahrer-App – Geräte, Kopplungscodes und Tages-Tokens (Konzept #513, Abschnitt 3, 7 und 8).
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_541.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_geraete_541.sql (mehrfach ausführbar)

SET NAMES utf8mb4;

-- Ein Gerät = ein Nummernkreis. Zeilen werden nie gelöscht, damit der LS-Stand einer Kennung erhalten bleibt.
CREATE TABLE IF NOT EXISTS fahrer_geraet (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  geraet_uid         CHAR(36)     NOT NULL COMMENT 'Geräte-ID, die die App bei jedem Aufruf mitschickt',
  kennung            VARCHAR(5)   NOT NULL COMMENT '2–5 Zeichen A–Z/0–9, steckt in der LS-Nummer',
  rolle              ENUM('tablet','notfall') NOT NULL COMMENT 'Fahrzeug-Handy kommt mit #547',
  bezeichnung        VARCHAR(100) NULL     COMMENT 'z. B. „T1 · RO-DR 101“',
  employee_id        INT          NULL     COMMENT 'Notfall-Handy: gehört genau diesem Fahrer',
  public_key         TEXT         NULL     COMMENT 'Öffentlicher Schlüssel (SPKI, Base64) aus dem Android Keystore',
  gekoppelt_am       DATETIME     NULL,
  gesperrt_am        DATETIME     NULL,
  ls_stand           INT          NOT NULL DEFAULT 0 COMMENT 'Höchste bekannte laufende LS-Nummer dieser Kennung, steigt nur',
  letzte_signatur_ms BIGINT       NOT NULL DEFAULT 0 COMMENT 'Schutz gegen wiederholte Signaturen',
  zuletzt_gesehen    DATETIME     NULL,
  erstellt_von       INT          NULL,
  erstellt_am        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fahrer_geraet_uid (geraet_uid),
  UNIQUE KEY uq_fahrer_geraet_kennung (kennung),
  KEY idx_fahrer_geraet_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kopplungscode: nur der SHA-256 wird gespeichert, gültig 10 Minuten, einmal verwendbar.
CREATE TABLE IF NOT EXISTS fahrer_kopplungscode (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  geraet_id    INT      NOT NULL,
  code_hash    CHAR(64) NOT NULL,
  gueltig_bis  DATETIME NOT NULL,
  benutzt_am   DATETIME NULL,
  erstellt_am  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fahrer_kopplungscode_hash (code_hash),
  KEY idx_fahrer_kopplungscode_geraet (geraet_id),
  CONSTRAINT fk_fahrer_kopplungscode_geraet FOREIGN KEY (geraet_id) REFERENCES fahrer_geraet(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tages-Token (Refresh): gültig bis Abmeldung, höchstens 16 h, an Gerät und Fahrer gebunden. Nur der SHA-256 liegt hier.
CREATE TABLE IF NOT EXISTS fahrer_tagestoken (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  geraet_id      INT      NOT NULL,
  employee_id    INT      NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  gueltig_bis    DATETIME NOT NULL,
  widerrufen_am  DATETIME NULL,
  erstellt_am    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fahrer_tagestoken_hash (token_hash),
  KEY idx_fahrer_tagestoken_geraet (geraet_id),
  CONSTRAINT fk_fahrer_tagestoken_geraet FOREIGN KEY (geraet_id) REFERENCES fahrer_geraet(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
