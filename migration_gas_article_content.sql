-- #251 (06.10.2026): Feld „Inhalt“ pro Gas-Artikel für das Preis-Tool (#249).
-- Eigene Tabelle in der Portal-DB; Lexware bleibt führend für Titel und Preise.
-- Verknüpfung über die Lexware-Artikel-ID (UUID), weil Nummer und Titel sich ändern können.
-- source: 'auto' = einmalig aus dem Titel erkannt, 'manuell' = im Portal gepflegt.
-- Danach gilt dieses Feld, nicht mehr der Titel.

CREATE TABLE IF NOT EXISTS gas_article_content (
  lexware_article_id CHAR(36) NOT NULL PRIMARY KEY,
  article_number     VARCHAR(100),
  title_snapshot     VARCHAR(255),
  content_value      DECIMAL(10,3),
  content_unit       ENUM('kg','L'),
  source             ENUM('auto','manuell') NOT NULL DEFAULT 'auto',
  updated_by         INT,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_gas_article_content_pair CHECK ((content_value IS NULL) = (content_unit IS NULL)),
  CONSTRAINT chk_gas_article_content_pos  CHECK (content_value IS NULL OR content_value > 0),
  FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
);
