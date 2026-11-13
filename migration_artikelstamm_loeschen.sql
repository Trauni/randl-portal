-- Artikelstamm: gelöschte Artikel merken, damit der SER-Import sie nicht wieder anlegt.
CREATE TABLE IF NOT EXISTS gas_artikel_geloescht (
  artikel_nr   VARCHAR(16)  PRIMARY KEY,
  bezeichnung  VARCHAR(120) NULL,
  von_id       INT          NULL,
  von_name     VARCHAR(255) NULL,
  geloescht_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (von_id) REFERENCES employees(id) ON DELETE SET NULL
);
