-- #260 (07.10.2026): SER-Produktstamm im Portal vorhalten, damit der Preis-Push nach SER (#261)
-- alle Felder unverändert zurückschicken kann und nur den Preis ändert.
-- Jeder Import ersetzt den Bestand komplett (der frische Export ist maßgeblich).
-- Übernommen werden nur SER-Produkte mit RG-Gegenstück in Lexware (RG-<prodnr>).

CREATE TABLE IF NOT EXISTS ser_product_imports (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  source_file      VARCHAR(255) NOT NULL,
  rows_total       INT NOT NULL,              -- Zeilen in der Datei
  products_total   INT NOT NULL,              -- aktuelle, aktive Randl-Produkte (Versorger 318)
  stored_total     INT NOT NULL,              -- davon mit RG-Gegenstück übernommen
  details          JSON,                      -- { warnings: [...], inactive: [{ prodnr, name }] }
  imported_by      INT,
  imported_by_name VARCHAR(255),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (imported_by) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ser_product_master (
  prodnr             VARCHAR(10) PRIMARY KEY,   -- SER-Produktnummer (= Lexware RG-<prodnr>)
  lexware_article_id CHAR(36),
  name               VARCHAR(255) NOT NULL,
  preis_cent         INT,                       -- netto in Cent, Stand Export
  record             JSON NOT NULL,             -- vollständige Exportzeile + aufgelöste Verweise (*_nr)
  import_id          INT NOT NULL,
  imported_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ser_product_master_article (lexware_article_id),
  FOREIGN KEY (import_id) REFERENCES ser_product_imports(id)
);
