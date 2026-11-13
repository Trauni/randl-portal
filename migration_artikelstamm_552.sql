-- #552 (13.11.2026): Artikelstamm im Portal – führend für die Fahrer-App, später auch für SER-Ablösung und BI.
-- Baut auf gas_artikel (#460) auf. Schlüssel bleibt artikel_nr = SER-Produktnummer ohne Lexware-Präfix
-- (Lexware: RG-7801200, NRG-…, PFAND-…; Pfandartikel werden im Kundenshop nicht angezeigt).
-- Preise intern in Cent, Mengen in kg bzw. Litern. Einkaufspreise bleiben in gas_ek_preis.

ALTER TABLE gas_artikel
  MODIFY gasart    VARCHAR(40) NULL,
  MODIFY kategorie ENUM('propan','technisch') NULL,
  MODIFY groesse   VARCHAR(16) NULL,
  ADD COLUMN typ                  CHAR(1)       NULL COMMENT 'SER: F Füllung, P Pfand/Leergut, S Steuer/Nutzung (Kaufflasche), V Provision' AFTER bezeichnung,
  ADD COLUMN aktiv                TINYINT(1)    NOT NULL DEFAULT 1 AFTER typ,
  ADD COLUMN un_nr                VARCHAR(8)    NULL AFTER aktiv,
  ADD COLUMN gefahrklasse         VARCHAR(8)    NULL COMMENT 'Gefahrzettel, z. B. 2.1' AFTER un_nr,
  ADD COLUMN ggvs_faktor          SMALLINT      NULL COMMENT 'Multiplikator ADR 1.1.3.6 (50/3/1)' AFTER gefahrklasse,
  ADD COLUMN befoerderungskategorie TINYINT     NULL COMMENT 'ADR 1.1.3.6: 1 (x50), 2 (x3), 3 (x1)' AFTER ggvs_faktor,
  ADD COLUMN fuellgewicht_kg      DECIMAL(8,3)  NULL AFTER befoerderungskategorie,
  ADD COLUMN inhalt_l             DECIMAL(9,3)  NULL AFTER fuellgewicht_kg,
  ADD COLUMN preis_netto_cent     INT           NULL AFTER inhalt_l,
  ADD COLUMN mwst_satz            DECIMAL(4,1)  NULL AFTER preis_netto_cent,
  ADD COLUMN pfand_artikel_nr     VARCHAR(16)   NULL COMMENT 'Füllung → zugehörige Pfandflasche (artikel_nr eines Typ-P-Artikels)' AFTER mwst_satz,
  ADD COLUMN feld_stand           JSON          NULL COMMENT '{ feld: { quelle, am } } – woher und seit wann ein Wert stammt' AFTER pfand_artikel_nr,
  ADD COLUMN geaendert_am         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_gas_artikel_pfand (pfand_artikel_nr),
  ADD INDEX idx_gas_artikel_aktiv (aktiv, typ);

-- Protokoll der Importe (Vorschau wird nicht protokolliert, nur angewandte Läufe)
CREATE TABLE IF NOT EXISTS gas_artikel_imports (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  quelle           VARCHAR(40)  NOT NULL,        -- ser | lexware
  source_file      VARCHAR(255) NOT NULL,
  neu              INT NOT NULL DEFAULT 0,
  ergaenzt         INT NOT NULL DEFAULT 0,       -- bestehende Artikel, leere Felder gefüllt
  abweichend       INT NOT NULL DEFAULT 0,       -- Wert im Portal anders, bewusst nicht überschrieben
  details          JSON,
  imported_by      INT,
  imported_by_name VARCHAR(255),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (imported_by) REFERENCES employees(id) ON DELETE SET NULL
);
