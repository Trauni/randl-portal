-- #604 Korrektur (19.11.2026): Im Artikelstamm stand bei einigen Artikeln noch der Preis VOR der letzten Preisänderung
-- (älterer SER-Export). Die Auswertung liest den Stammpreis, deshalb wird er hier auf den aktuellen Listenpreis gesetzt,
-- aber nur dort, wo er genau dem alten Preis entspricht. Von Hand oder per Preis-Tool geänderte Preise bleiben unberührt.
-- Jede Korrektur steht im Änderungsverlauf des Artikels. Idempotent: nach dem Lauf trifft die Bedingung nicht mehr zu.

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '1427', '1497', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801000' AND preis_netto_cent = 1427;
UPDATE gas_artikel SET preis_netto_cent = 1497 WHERE artikel_nr = '7801000' AND preis_netto_cent = 1427;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '1736', '1848', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801050' AND preis_netto_cent = 1736;
UPDATE gas_artikel SET preis_netto_cent = 1848 WHERE artikel_nr = '7801050' AND preis_netto_cent = 1736;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '2926', '3080', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801100' AND preis_netto_cent = 2926;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801100' AND preis_netto_cent = 2926;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '2926', '3080', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801200' AND preis_netto_cent = 2926;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801200' AND preis_netto_cent = 2926;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '2926', '3080', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801250' AND preis_netto_cent = 2926;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801250' AND preis_netto_cent = 2926;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '9368', '9830', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801300' AND preis_netto_cent = 9368;
UPDATE gas_artikel SET preis_netto_cent = 9830 WHERE artikel_nr = '7801300' AND preis_netto_cent = 9368;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '1427', '1497', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7801800' AND preis_netto_cent = 1427;
UPDATE gas_artikel SET preis_netto_cent = 1497 WHERE artikel_nr = '7801800' AND preis_netto_cent = 1427;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '3359', '3513', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7802000' AND preis_netto_cent = 3359;
UPDATE gas_artikel SET preis_netto_cent = 3513 WHERE artikel_nr = '7802000' AND preis_netto_cent = 3359;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '3568', '3722', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = '7802010' AND preis_netto_cent = 3568;
UPDATE gas_artikel SET preis_netto_cent = 3722 WHERE artikel_nr = '7802010' AND preis_netto_cent = 3568;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '4500', '4815', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T002' AND preis_netto_cent = 4500;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T002' AND preis_netto_cent = 4500;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '7000', '6420', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T003' AND preis_netto_cent = 7000;
UPDATE gas_artikel SET preis_netto_cent = 6420 WHERE artikel_nr = 'T003' AND preis_netto_cent = 7000;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '4000', '4280', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T004' AND preis_netto_cent = 4000;
UPDATE gas_artikel SET preis_netto_cent = 4280 WHERE artikel_nr = 'T004' AND preis_netto_cent = 4000;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '4500', '4815', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T005' AND preis_netto_cent = 4500;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T005' AND preis_netto_cent = 4500;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '2436', '2607', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T006' AND preis_netto_cent = 2436;
UPDATE gas_artikel SET preis_netto_cent = 2607 WHERE artikel_nr = 'T006' AND preis_netto_cent = 2436;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '9430', '9630', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T012' AND preis_netto_cent = 9430;
UPDATE gas_artikel SET preis_netto_cent = 9630 WHERE artikel_nr = 'T012' AND preis_netto_cent = 9430;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '4815', '6955', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T022' AND preis_netto_cent = 4815;
UPDATE gas_artikel SET preis_netto_cent = 6955 WHERE artikel_nr = 'T022' AND preis_netto_cent = 4815;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '8500', '9095', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T030' AND preis_netto_cent = 8500;
UPDATE gas_artikel SET preis_netto_cent = 9095 WHERE artikel_nr = 'T030' AND preis_netto_cent = 8500;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '6500', '6955', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T031' AND preis_netto_cent = 6500;
UPDATE gas_artikel SET preis_netto_cent = 6955 WHERE artikel_nr = 'T031' AND preis_netto_cent = 6500;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '45000', '48150', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T032' AND preis_netto_cent = 45000;
UPDATE gas_artikel SET preis_netto_cent = 48150 WHERE artikel_nr = 'T032' AND preis_netto_cent = 45000;

INSERT INTO gas_artikel_aenderungen (artikel_nr, feld, alt, neu, von_name)
  SELECT artikel_nr, 'preis_netto_cent', '7500', '8025', 'Korrektur #604' FROM gas_artikel WHERE artikel_nr = 'T033' AND preis_netto_cent = 7500;
UPDATE gas_artikel SET preis_netto_cent = 8025 WHERE artikel_nr = 'T033' AND preis_netto_cent = 7500;

