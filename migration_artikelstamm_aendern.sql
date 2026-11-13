-- Artikelstamm bearbeiten (Folge zu #552): Protokoll jeder Änderung im Portal.
CREATE TABLE IF NOT EXISTS gas_artikel_aenderungen (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  artikel_nr   VARCHAR(16)  NOT NULL,
  feld         VARCHAR(40)  NOT NULL,
  alt          VARCHAR(255) NULL,
  neu          VARCHAR(255) NULL,
  von_id       INT          NULL,
  von_name     VARCHAR(255) NULL,
  geaendert_am DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gas_artikel_aenderungen_nr (artikel_nr, geaendert_am),
  FOREIGN KEY (von_id) REFERENCES employees(id) ON DELETE SET NULL
);
