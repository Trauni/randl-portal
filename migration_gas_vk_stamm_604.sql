-- #604 (19.11.2026): Verkaufspreise der Gas-Auswertung aus dem Artikelstamm statt aus dem Code.
-- Füllt gas_artikel (nur fehlende Artikel/Preise) und ergänzt die bekannten Preisänderungen Oktober 2026 im
-- Preisprotokoll, falls dort für Artikel und Tag keine echte Zeile steht. Vorhandene Werte werden nie überschrieben.
-- Erzeugt aus test/fixtures/gasStammdatenReferenz.js. Idempotent.

-- 1. Artikel anlegen, die im Stamm noch fehlen
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('5909040', 'R904 Füllung 1,8 kg Campingaz', 'Campingaz', 'technisch', '1.8 kg', 1.8, NULL, 1, 'F', 2689);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('5909070', 'R907 Füllung 2,75 kg Campingaz', 'Campingaz', 'technisch', '2.75 kg', 2.75, NULL, 1, 'F', 2889);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('5920100', 'Ballongas Typ 10, 1,8 m³', 'Ballongas/Helium', 'technisch', '', NULL, NULL, 1, 'F', 15000);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('5920200', 'Helium Ballongas Füllung 20 L', 'Ballongas/Helium', 'technisch', '', NULL, NULL, 1, 'F', 25500);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801000', '5-kg Brenngas Camping', 'Propan', 'propan', '5 kg', 5, 'propan', 1, 'F', 1497);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801050', '8-kg Brenngas BBQ-Fla.', 'Propan', 'propan', '8 kg', 8, 'propan', 1, 'F', 1848);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801100', '11-kg Brenngas Camping', 'Propan', 'propan', '11 kg', 11, 'propan', 1, 'F', 3080);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801200', '11-kg Brenngas Pfand', 'Propan', 'propan', '11 kg', 11, 'propan', 1, 'F', 3080);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801250', '11-kg Brenngas ALUGAS', 'Propan', 'propan', '11 kg', 11, 'propan', 1, 'F', 3080);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801300', '33-kg Brenngas Pfand', 'Propan', 'propan', '33 kg', 33, 'propan', 1, 'F', 9830);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7801800', '5-kg Brenngas Pfand', 'Propan', 'propan', '5 kg', 5, 'propan', 1, 'F', 1497);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7802000', '11-kg MOTOGAS Pfand', 'Propan Treibgas', 'propan', '11 kg', 11, 'motogas', 1, 'F', 3513);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('7802010', '11-kg BLUETEC Pfand', 'Propan Treibgas', 'propan', '11 kg', 11, 'motogas', 1, 'F', 3722);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T001', 'Biergas 70/30 20 L', 'Biergas', 'technisch', '', NULL, NULL, 1, 'F', 6420);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T002', '10 kg CO2 Theke Lebensmittel', 'CO2', 'technisch', '10 kg', 10, NULL, 1, 'F', 4815);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T003', '20 kg CO2 Lebensmittel', 'CO2', 'technisch', '20 kg', 20, NULL, 1, 'F', 6420);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T004', '6 kg CO2 Theke Lebensmittel', 'CO2', 'technisch', '6 kg', 6, NULL, 1, 'F', 4280);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T005', '10 kg CO2 Theke Lebensmittel Steigrohr', 'CO2', 'technisch', '10 kg', 10, NULL, 1, 'F', 4815);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T006', '2 kg CO2 Theke Lebensmittel', 'CO2', 'technisch', '2 kg', 2, NULL, 1, 'F', 2607);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T007', 'Biergas 70/30 50 L', 'Biergas', 'technisch', '', NULL, NULL, 1, 'F', 6420);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T010', 'Argon 4.6 10 L', 'Argon', 'technisch', '', NULL, NULL, 1, 'F', 5885);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T011', 'Argon 4.6 20 L', 'Argon', 'technisch', '', NULL, NULL, 1, 'F', 7490);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T012', 'Argon 4.6 50 L', 'Argon', 'technisch', '', NULL, NULL, 1, 'F', 9630);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T015', 'Arcox18 20 L', 'Arcox (Mischgas)', 'technisch', '', NULL, NULL, 1, 'F', 6420);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T016', 'Arcox18 10 L', 'Arcox (Mischgas)', 'technisch', '', NULL, NULL, 1, 'F', 4815);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T017', 'Arcox18 50 L', 'Arcox (Mischgas)', 'technisch', '', NULL, NULL, 1, 'F', 9095);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T020', 'Sauerstoff 20 L', 'Sauerstoff', 'technisch', '', NULL, NULL, 1, 'F', 4815);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T021', 'Sauerstoff 10 L', 'Sauerstoff', 'technisch', '', NULL, NULL, 1, 'F', 4280);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T022', 'Sauerstoff 50 L', 'Sauerstoff', 'technisch', '', NULL, NULL, 1, 'F', 6955);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T030', 'Stickstoff 5.0 50 L', 'Stickstoff', 'technisch', '', NULL, NULL, 1, 'F', 9095);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T031', 'Stickstoff 5.0 10 L', 'Stickstoff', 'technisch', '', NULL, NULL, 1, 'F', 6955);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T033', 'Stickstoff 5.0 20 L', 'Stickstoff', 'technisch', '', NULL, NULL, 1, 'F', 8025);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T035', 'Acetylen 10 L', 'Acetylen', 'technisch', '', NULL, NULL, 1, 'F', 7500);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T036', 'Acetylen 20 L', 'Acetylen', 'technisch', '', NULL, NULL, 1, 'F', 7500);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T037', 'Acetylen 50 L', 'Acetylen', 'technisch', '', NULL, NULL, 1, 'F', 9500);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T038', 'Formiergas 90/10 10 L', 'Formiergas', 'technisch', '', NULL, NULL, 1, 'F', NULL);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('5920050', 'Artikel 5920050 (Bezeichnung fehlt)', NULL, 'technisch', '', NULL, NULL, 0, 'F', 51500);
INSERT IGNORE INTO gas_artikel (artikel_nr, bezeichnung, gasart, kategorie, groesse, kg_fuellung, ek_gruppe, zaehlt_als_flasche, typ, preis_netto_cent) VALUES ('T032', 'Artikel T032 (Bezeichnung fehlt)', NULL, 'technisch', '', NULL, NULL, 0, 'F', 48150);

-- 2. Aktuellen Preis nur setzen, wo noch keiner steht
UPDATE gas_artikel SET preis_netto_cent = 2689 WHERE artikel_nr = '5909040' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 2889 WHERE artikel_nr = '5909070' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 15000 WHERE artikel_nr = '5920100' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 25500 WHERE artikel_nr = '5920200' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 1497 WHERE artikel_nr = '7801000' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 1848 WHERE artikel_nr = '7801050' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801100' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801200' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 3080 WHERE artikel_nr = '7801250' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 9830 WHERE artikel_nr = '7801300' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 1497 WHERE artikel_nr = '7801800' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 3513 WHERE artikel_nr = '7802000' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 3722 WHERE artikel_nr = '7802010' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6420 WHERE artikel_nr = 'T001' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T002' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6420 WHERE artikel_nr = 'T003' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4280 WHERE artikel_nr = 'T004' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T005' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 2607 WHERE artikel_nr = 'T006' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6420 WHERE artikel_nr = 'T007' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 5885 WHERE artikel_nr = 'T010' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 7490 WHERE artikel_nr = 'T011' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 9630 WHERE artikel_nr = 'T012' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6420 WHERE artikel_nr = 'T015' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T016' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 9095 WHERE artikel_nr = 'T017' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4815 WHERE artikel_nr = 'T020' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 4280 WHERE artikel_nr = 'T021' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6955 WHERE artikel_nr = 'T022' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 9095 WHERE artikel_nr = 'T030' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 6955 WHERE artikel_nr = 'T031' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 8025 WHERE artikel_nr = 'T033' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 7500 WHERE artikel_nr = 'T035' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 7500 WHERE artikel_nr = 'T036' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 9500 WHERE artikel_nr = 'T037' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 51500 WHERE artikel_nr = '5920050' AND preis_netto_cent IS NULL;
UPDATE gas_artikel SET preis_netto_cent = 48150 WHERE artikel_nr = 'T032' AND preis_netto_cent IS NULL;

-- 3. Bekannte Preisänderungen ins Protokoll, wenn für Artikel und Tag keine echte Zeile existiert
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801000', 'Artikel 7801000', 'Altbestand aus Gas-Auswertung (#604)', 14.27, 14.97, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801000' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801050', 'Artikel 7801050', 'Altbestand aus Gas-Auswertung (#604)', 17.36, 18.48, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801050' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801100', 'Artikel 7801100', 'Altbestand aus Gas-Auswertung (#604)', 29.26, 30.8, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801100' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801200', 'Artikel 7801200', 'Altbestand aus Gas-Auswertung (#604)', 29.26, 30.8, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801200' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801250', 'Artikel 7801250', 'Altbestand aus Gas-Auswertung (#604)', 27.17, 29.26, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-06 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801250' AND DATE(l.created_at) = '2026-10-06' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801250', 'Artikel 7801250', 'Altbestand aus Gas-Auswertung (#604)', 29.26, 30.8, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801250' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801300', 'Artikel 7801300', 'Altbestand aus Gas-Auswertung (#604)', 93.68, 98.3, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801300' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7801800', 'Artikel 7801800', 'Altbestand aus Gas-Auswertung (#604)', 14.27, 14.97, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7801800' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7802000', 'Artikel 7802000', 'Altbestand aus Gas-Auswertung (#604)', 31.5, 33.59, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-06 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7802000' AND DATE(l.created_at) = '2026-10-06' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7802000', 'Artikel 7802000', 'Altbestand aus Gas-Auswertung (#604)', 33.59, 35.13, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7802000' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7802010', 'Artikel 7802010', 'Altbestand aus Gas-Auswertung (#604)', 31.5, 35.68, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-06 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7802010' AND DATE(l.created_at) = '2026-10-06' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-7802010', 'Artikel 7802010', 'Altbestand aus Gas-Auswertung (#604)', 35.68, 37.22, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-13 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = '7802010' AND DATE(l.created_at) = '2026-10-13' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T002', 'Artikel T002', 'Altbestand aus Gas-Auswertung (#604)', 45, 48.15, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T002' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T003', 'Artikel T003', 'Altbestand aus Gas-Auswertung (#604)', 70, 64.2, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T003' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T004', 'Artikel T004', 'Altbestand aus Gas-Auswertung (#604)', 40, 42.8, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T004' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T005', 'Artikel T005', 'Altbestand aus Gas-Auswertung (#604)', 45, 48.15, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T005' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T006', 'Artikel T006', 'Altbestand aus Gas-Auswertung (#604)', 24.36, 26.07, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T006' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T012', 'Artikel T012', 'Altbestand aus Gas-Auswertung (#604)', 94.3, 96.3, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T012' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T022', 'Artikel T022', 'Altbestand aus Gas-Auswertung (#604)', 48.15, 69.55, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T022' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T030', 'Artikel T030', 'Altbestand aus Gas-Auswertung (#604)', 85, 90.95, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T030' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T031', 'Artikel T031', 'Altbestand aus Gas-Auswertung (#604)', 65, 69.55, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T031' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T032', 'Artikel T032', 'Altbestand aus Gas-Auswertung (#604)', 450, 481.5, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T032' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
INSERT INTO price_change_log (job_id, target, lexware_article_id, article_number, article_name, rule_text, old_net, new_net, status, reason, created_at)
  SELECT 'seed-604', 'lexware', '00000000-0000-0000-0000-000000000000', 'RG-T033', 'Artikel T033', 'Altbestand aus Gas-Auswertung (#604)', 75, 80.25, 'ok', 'Nachgetragen aus den bisher fest im Code geführten Preisen', '2026-10-07 00:00:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM price_change_log l WHERE REPLACE(REPLACE(l.article_number, 'NRG-', ''), 'RG-', '') = 'T033' AND DATE(l.created_at) = '2026-10-07' AND l.status = 'ok' AND l.target = 'lexware');
