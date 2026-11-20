-- #617 Schritt A1: interne Artikel-ID, Lexware-Verknüpfung, Einheit und Artikelgruppen. Nur additiv.
-- Es werden keine Daten geändert oder gelöscht; der Primärschlüssel artikel_nr bleibt vorerst unverändert,
-- der Code läuft ohne Änderung weiter. Die Umstellung des Primärschlüssels auf id folgt erst, wenn artikel_nr
-- optional wird (Artikel ohne SER-Nummer), siehe #617.
--
--  id          interne, unveränderliche Artikel-ID (bestehende Zeilen werden von der Datenbank fortlaufend nummeriert).
--              Auf diese ID zeigen später alle Verweise im Portal. Nach außen (Fahrer-App, Shop) bleibt artikel_nr.
--  lexware_id  Lexware-Artikel-ID (UUID), die Verbindung zum Lexware-Artikel. Wird erst vom Abgleich gefüllt (#561).
--  einheit     Einheit wie in Lexware geführt (Stück, Stunde, Füllung, Pfand, …), unverändert übernommen.
--              Die Zuordnung zum Typ folgt im Abgleich.
--  gruppe_id   Zuordnung zu einer Artikelgruppe (Sparte oder Gruppe darunter), leer = nicht eingeordnet.
--
-- artikel_gruppe: Baum für Sparten und Gruppen. Oberste Ebene (parent_id leer) = Sparte,
-- darunter beliebig viele Gruppen, z. B. Gashandel > Propan > Füllungen. Es werden keine Gruppen vorbelegt.
-- Hinweis: Eindeutige Namen je Ebene sichert die Datenbank nur unterhalb einer Sparte; für die oberste Ebene
-- (parent_id leer) prüft das der Code, weil MariaDB leere Werte in UNIQUE nicht vergleicht.

CREATE TABLE IF NOT EXISTS artikel_gruppe (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  parent_id    INT          NULL COMMENT 'leer = oberste Ebene (Sparte)',
  name         VARCHAR(80)  NOT NULL,
  sortierung   INT          NOT NULL DEFAULT 0,
  aktiv        TINYINT(1)   NOT NULL DEFAULT 1,
  erstellt_am  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  geaendert_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_artikel_gruppe_name (parent_id, name),
  CONSTRAINT fk_artikel_gruppe_parent FOREIGN KEY (parent_id) REFERENCES artikel_gruppe(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE gas_artikel
  ADD COLUMN IF NOT EXISTS id         INT          NOT NULL AUTO_INCREMENT COMMENT 'interne Artikel-ID (#617)' AFTER artikel_nr,
  ADD COLUMN IF NOT EXISTS lexware_id CHAR(36)     NULL COMMENT 'Lexware-Artikel-ID (UUID), vom Abgleich gefüllt' AFTER id,
  ADD COLUMN IF NOT EXISTS einheit    VARCHAR(40)  NULL COMMENT 'Einheit wie in Lexware (Stück, Stunde, Füllung, Pfand, …)' AFTER lexware_id,
  ADD COLUMN IF NOT EXISTS gruppe_id  INT          NULL COMMENT 'Artikelgruppe (artikel_gruppe), leer = nicht eingeordnet' AFTER einheit,
  ADD UNIQUE INDEX IF NOT EXISTS uq_gas_artikel_id (id),
  ADD UNIQUE INDEX IF NOT EXISTS uq_gas_artikel_lexware_id (lexware_id),
  ADD INDEX IF NOT EXISTS idx_gas_artikel_gruppe (gruppe_id),
  ADD CONSTRAINT fk_gas_artikel_gruppe FOREIGN KEY IF NOT EXISTS (gruppe_id) REFERENCES artikel_gruppe(id) ON DELETE SET NULL;
