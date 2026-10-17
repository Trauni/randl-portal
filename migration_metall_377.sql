-- #377 (17.10.2026): Kundenmails nur mit Link – Fertigung begonnen/fertig, neue Fotos/Dateien.
-- Ausführen: mariadb radmin_randl_portal < migration_metall_377.sql (mehrfach ausführbar)
--
-- Belege (AN/AB/LS/RE) verschickt Lexware selbst („Speichern und senden“), dafür keine Mail aus dem Portal
-- (Entscheidung Klaus 17.10.2026). Mails gehen über das admin-backend des Kundenportals (Graph).
-- kundenmails: pro Metallkunde abschaltbar (Standard an).
-- metall_benachrichtigung: Warteschlange; faellig_ab = 10 Minuten nach dem Klick (Fehlklick korrigierbar,
-- mehrere Freigaben → eine Mail). ergebnis: gesendet | kein_zugang | keine_mail | abgeschaltet | veraltet | nichts_neu | fehler

ALTER TABLE metall_kunde
  ADD COLUMN IF NOT EXISTS kundenmails TINYINT(1) NOT NULL DEFAULT 1 AFTER aktiv;

CREATE TABLE IF NOT EXISTS metall_benachrichtigung (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  vorgang_id    INT NOT NULL,
  art           ENUM('fertigung_beginn','fertigung_fertig','dateien') NOT NULL,
  erstellt_am   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  faellig_ab    DATETIME NOT NULL,
  versuche      TINYINT NOT NULL DEFAULT 0,
  erledigt_am   DATETIME,
  ergebnis      VARCHAR(20),
  fehler        VARCHAR(500),
  INDEX idx_metall_benachrichtigung_offen (erledigt_am, faellig_ab),
  FOREIGN KEY (vorgang_id) REFERENCES metall_vorgang(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
