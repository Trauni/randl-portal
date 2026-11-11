-- #460 (11.11.2026): Gas-Auswertung im Mitarbeiterportal.
-- Rohertrag und Einkaufspreise sind intern: Zugriff nur über Bereich 'gashandel.auswertung'.
-- Kundennummern bleiben nur in der Datenbank (kein Export ins Repo).

CREATE TABLE IF NOT EXISTS gas_artikel (
  artikel_nr         VARCHAR(16)  PRIMARY KEY,           -- SER-Produktnr., z. B. 7801200, T002
  bezeichnung        VARCHAR(120) NOT NULL,
  gasart             VARCHAR(40)  NOT NULL,
  kategorie          ENUM('propan','technisch') NOT NULL,
  groesse            VARCHAR(16)  NOT NULL,
  kg_fuellung        DECIMAL(6,2) NULL,                  -- nur Propan, Treibgas, CO2, Campingaz
  ek_gruppe          VARCHAR(16)  NULL,                  -- propan | motogas (Zuordnung zu gas_ek_preis)
  zaehlt_als_flasche TINYINT(1)   NOT NULL DEFAULT 1     -- 0: Paletten 2805400/2805600, Kappen 5904000
);

CREATE TABLE IF NOT EXISTS gas_beleg_position (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  terminal      VARCHAR(8)   NOT NULL,
  kunde_nr      VARCHAR(16)  NOT NULL,
  typ           VARCHAR(4)   NOT NULL,                   -- L, Q, L r
  beleg_nr      VARCHAR(16)  NOT NULL,
  pos           SMALLINT     NOT NULL,
  datum         DATE         NOT NULL,
  artikel_nr    VARCHAR(16)  NOT NULL,
  voll          INT          NOT NULL,
  leer          INT          NOT NULL,
  kg            DECIMAL(10,1) NOT NULL,
  quelle        VARCHAR(120) NULL,
  importiert_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_beleg_pos (beleg_nr, pos),
  KEY ix_datum (datum), KEY ix_terminal_datum (terminal, datum), KEY ix_kunde (kunde_nr)
);

CREATE TABLE IF NOT EXISTS gas_tour (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  datum               DATE         NOT NULL,
  terminal            VARCHAR(8)   NOT NULL,
  bezeichnung         VARCHAR(120) NOT NULL,
  fahrer              VARCHAR(40)  NULL,
  plan_kg             DECIMAL(10,1) NULL,
  plan_bestellungen   INT          NULL,
  storniert           TINYINT(1)   NOT NULL DEFAULT 0,
  km_optimal          DECIMAL(8,1) NULL,
  fahrminuten_optimal INT          NULL,
  UNIQUE KEY uq_tour (datum, terminal, bezeichnung)
);

-- Einkaufspreise: nie überschreiben, neue Zeile mit neuem gueltig_ab. Korrektur nur durch Neuanlage
-- (gleicher Tag = Ersatz, der alte Stand bleibt im Protokoll).
CREATE TABLE IF NOT EXISTS gas_ek_preis (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  lieferant   VARCHAR(40)  NOT NULL DEFAULT 'Tyczka',
  ek_gruppe   VARCHAR(16)  NOT NULL,                     -- propan (je kg), motogas (je Füllung)
  preisbasis  ENUM('kg','fuellung') NOT NULL,
  gueltig_ab  DATE         NOT NULL,
  preis_netto DECIMAL(8,3) NOT NULL,
  notiz       VARCHAR(200) NULL,
  erfasst_von VARCHAR(80)  NOT NULL,
  erfasst_am  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ek (lieferant, ek_gruppe, gueltig_ab)
);

CREATE TABLE IF NOT EXISTS gas_ek_preis_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  aktion      ENUM('neu','ersetzt') NOT NULL,
  lieferant   VARCHAR(40)  NOT NULL,
  ek_gruppe   VARCHAR(16)  NOT NULL,
  preisbasis  ENUM('kg','fuellung') NOT NULL,
  gueltig_ab  DATE         NOT NULL,
  preis_alt   DECIMAL(8,3) NULL,
  preis_neu   DECIMAL(8,3) NOT NULL,
  notiz       VARCHAR(200) NULL,
  benutzer    VARCHAR(80)  NOT NULL,
  zeitpunkt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_gruppe (ek_gruppe, gueltig_ab)
);

CREATE TABLE IF NOT EXISTS gas_pauschale_staffel (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  staffel      VARCHAR(16) NOT NULL,                     -- S, S+
  bis_kg       INT NULL,                                 -- NULL = ab 100 kg
  betrag_netto DECIMAL(8,2) NOT NULL,
  UNIQUE KEY uq_staffel (staffel, bis_kg)
);

CREATE TABLE IF NOT EXISTS gas_parameter (
  schluessel VARCHAR(40) PRIMARY KEY,
  wert       DECIMAL(10,3) NOT NULL,
  notiz      VARCHAR(200) NULL
);

CREATE TABLE IF NOT EXISTS gas_kunde_geo (
  kunde_nr        VARCHAR(16) PRIMARY KEY,
  lat             DECIMAL(9,6) NULL,
  lon             DECIMAL(9,6) NULL,
  km_einfach      DECIMAL(7,1) NULL,
  min_einfach     INT NULL,
  aktualisiert_am DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Startwerte (Tyczka). Historie bis 15.10.2026 je Füllung: eigene Gruppen je Größe, siehe Import-Skript.
INSERT IGNORE INTO gas_parameter (schluessel, wert, notiz) VALUES
 ('km_je_stopp', 12.650, 'Ø optimale Route 2026'),
 ('eur_je_km', 0.400, 'Annahme, mit Tank-/Werkstattbelegen prüfen'),
 ('fahr_min', 15.400, 'Ø Fahrzeit je Stopp, OSRM × 1,1'),
 ('stand_min', 9.000, 'kalibriert Tour 03.11.2026'),
 ('min_je_flasche', 0.600, 'kalibriert Tour 03.11.2026'),
 ('eur_je_h', 20.000, 'Minijob 15 €/h + ca. 31 % Abgaben');

INSERT IGNORE INTO gas_ek_preis (lieferant, ek_gruppe, preisbasis, gueltig_ab, preis_netto, notiz, erfasst_von) VALUES
 ('Tyczka','propan','kg','2025-12-20',1.280,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2025-12-20',17.930,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-02-15',1.310,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-02-15',18.260,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-03-15',1.340,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-03-15',18.590,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-04-15',1.670,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-04-15',22.220,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-05-15',1.480,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-05-15',20.130,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-06-15',1.410,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-06-15',19.360,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-07-15',1.330,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-07-15',18.480,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-08-15',1.400,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-08-15',19.250,'Tyczka-Liste','Übernahme #460'),
 ('Tyczka','propan','kg','2026-10-15',1.540,'Tyczka-Liste (aus Historie je Füllung)','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-10-15',20.790,'Tyczka-Liste','Übernahme #460');

INSERT IGNORE INTO gas_ek_preis (lieferant, ek_gruppe, preisbasis, gueltig_ab, preis_netto, notiz, erfasst_von) VALUES
 ('Tyczka','propan','kg','2026-11-11',1.520,'verhandelt, unbefristet','Übernahme #460'),
 ('Tyczka','motogas','fuellung','2026-11-15',22.550,'Liste','Übernahme #460');

INSERT IGNORE INTO gas_pauschale_staffel (staffel, bis_kg, betrag_netto) VALUES
 ('S',11,19.90),('S',33,14.90),('S',66,9.90),('S',99,4.90),('S',NULL,0.00),
 ('S+',11,24.90),('S+',33,19.90),('S+',66,14.90),('S+',99,9.90),('S+',NULL,4.90);

-- Sonderpreise bekannter Barkunden (Faktor auf Liste je Periode A–D). Werte nur in der Datenbank pflegen (Kundennummern).
CREATE TABLE IF NOT EXISTS gas_sonderpreis (
  kunde_nr VARCHAR(16) NOT NULL,
  periode  CHAR(1)     NOT NULL,                         -- A bis 14.04., B bis 14.05., C bis 12.10., D danach
  faktor   DECIMAL(6,4) NOT NULL,
  PRIMARY KEY (kunde_nr, periode)
);
