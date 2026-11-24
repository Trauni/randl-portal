-- #614: Bestellte Leergut-Menge je Stopp-Position, damit die Fahrer-App das Leergut vorbelegen kann
-- (auch reine Leergut-Abholung mit 0 Vollgut). NULL = unbekannt (Stopps von vor dieser Migration):
-- die App nimmt dann Tausch 1:1 aus soll_menge.
-- Ausführen: mariadb radmin_randl_portal < migration_fahrer_soll_leergut_614.sql (mehrfach ausführbar)

SET NAMES utf8mb4;

ALTER TABLE fahrer_stopp_position
  ADD COLUMN IF NOT EXISTS soll_leergut DECIMAL(8,2) NULL COMMENT 'Bestelltes Leergut (emptyReturn der Bestellung), NULL = unbekannt (#614)' AFTER soll_menge;
