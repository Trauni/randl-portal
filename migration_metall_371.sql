-- #371 (17.10.2026): Eingang Kundenanfragen/Annahmen/Freischaltung – Absender und Mail-Fehler.
-- Ausführen: mariadb radmin_randl_portal < migration_metall_371.sql (mehrfach ausführbar)
--
-- Bei einer Freischaltungs-Anfrage ist der Kunde meist noch kein Metallkunde (kein metall_kunde,
-- kein Vorgang). Name, E-Mail und Lexware-Kontakt kommen deshalb mit der Meldung aus dem Gas-Shop.
-- mail_fehler: Der Gas-Shop verschickt die Mail ans Sammelpostfach und meldet das Ergebnis zurück.

ALTER TABLE metall_eingang
  ADD COLUMN IF NOT EXISTS lexware_kontakt_id CHAR(36) NULL AFTER annahme_id,
  ADD COLUMN IF NOT EXISTS kunde_name VARCHAR(255) NULL AFTER kunden_konto_id,
  ADD COLUMN IF NOT EXISTS kunde_email VARCHAR(255) NULL AFTER kunde_name,
  ADD COLUMN IF NOT EXISTS mail_fehler VARCHAR(500) NULL AFTER mail_gesendet_am;
