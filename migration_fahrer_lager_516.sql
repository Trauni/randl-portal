-- #516: Lagerverkauf am festen Tablet (Konzept #513, Abschnitt 11, Repo dr-ser-abloese).
-- Geräterolle „lager“ mit Dauerlogin ohne Mitarbeiter, Barverkauf (BV) mit eigenem Nummernkreis, Preise am Beleg,
-- Storno eines Barverkaufs, Einstellungen (Sonder-PIN als Hash, Sammelmail an die Buchhaltung).
-- Vorher Backup:  mariadb-dump radmin_randl_portal > portal_vor_516.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_fahrer_lager_516.sql (mehrfach ausführbar)

SET NAMES utf8mb4;

-- Rolle lager; BV-Stand wie ls_stand (steigt nur).
ALTER TABLE fahrer_geraet
  MODIFY rolle ENUM('tablet','notfall','lager') NOT NULL COMMENT 'lager = festes Tablet am Lager (#516), Dauerlogin ohne Authentik',
  ADD COLUMN IF NOT EXISTS bv_stand INT NOT NULL DEFAULT 0 COMMENT 'Höchste bekannte laufende BV-Nummer dieser Kennung (#516), steigt nur' AFTER ls_stand;

-- Am Lager-Gerät meldet sich kein Mitarbeiter an: Token, Ereignis und Beleg gehören dem Gerät.
ALTER TABLE fahrer_tagestoken MODIFY employee_id INT NULL COMMENT 'NULL = Dauer-Token eines Lager-Geräts (#516)';
ALTER TABLE fahrer_ereignis   MODIFY employee_id INT NULL COMMENT 'NULL = Lager-Gerät (#516)';
ALTER TABLE fahrer_beleg      MODIFY employee_id INT NULL COMMENT 'NULL = Lager-Gerät (#516)';

ALTER TABLE fahrer_beleg
  MODIFY ls_nummer VARCHAR(20) NOT NULL COMMENT 'LS-<Kennung>-<lfd. Nr.> oder BV-<Kennung>-<lfd. Nr.> (#516)',
  ADD COLUMN IF NOT EXISTS belegart          ENUM('LS','BV') NOT NULL DEFAULT 'LS' COMMENT 'BV = Barverkauf am Lager (#516)' AFTER ls_nummer,
  ADD COLUMN IF NOT EXISTS verkaeufer        VARCHAR(60)  NULL COMMENT 'Lager: Name aus den Einstellungen des Geräts' AFTER unterschrift_png,
  ADD COLUMN IF NOT EXISTS zahlart           VARCHAR(10)  NULL COMMENT 'bar' AFTER verkaeufer,
  ADD COLUMN IF NOT EXISTS summe_netto_cent  INT          NULL AFTER zahlart,
  ADD COLUMN IF NOT EXISTS summe_brutto_cent INT          NULL AFTER summe_netto_cent,
  ADD COLUMN IF NOT EXISTS storniert_am      DATETIME     NULL COMMENT 'Gerätezeit des Stornos (nur BV, nur am selben Tag)' AFTER summe_brutto_cent,
  ADD COLUMN IF NOT EXISTS storno_grund      VARCHAR(200) NULL AFTER storniert_am,
  ADD COLUMN IF NOT EXISTS storno_verkaeufer VARCHAR(60)  NULL AFTER storno_grund,
  ADD COLUMN IF NOT EXISTS storno_ereignis_id BIGINT      NULL AFTER storno_verkaeufer,
  ADD KEY IF NOT EXISTS idx_fahrer_beleg_art_datum (belegart, erstellt_am);

ALTER TABLE fahrer_beleg_position
  ADD COLUMN IF NOT EXISTS preis_netto_cent INT          NULL COMMENT 'Barverkauf: Listenpreis je Stück' AFTER leergut,
  ADD COLUMN IF NOT EXISTS mwst_satz        DECIMAL(4,1) NULL AFTER preis_netto_cent;

-- Einstellungen der Fahrer-App, die das Büro pflegt (#516): Sonder-PIN fürs Storno (nur Hash), Sammelmail.
CREATE TABLE IF NOT EXISTS fahrer_einstellung (
  schluessel    VARCHAR(60) PRIMARY KEY,
  wert          TEXT        NULL,
  geaendert_von INT         NULL,
  geaendert_am  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
