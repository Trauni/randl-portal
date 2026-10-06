-- #254 (06.10.2026): Protokoll aller Preisänderungen aus dem Preis-Tool (#249).
-- Eine Zeile pro Artikel und Lauf: wer, wann, welche Regel, alt → neu, Ergebnis.
-- status: pending (Job läuft) | ok | conflict (Preis seit Vorschau geändert, nicht geschrieben) | error

CREATE TABLE IF NOT EXISTS price_change_log (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  job_id             CHAR(36) NOT NULL,
  lexware_article_id CHAR(36) NOT NULL,
  article_number     VARCHAR(100),
  article_name       VARCHAR(255),
  rule_text          VARCHAR(255) NOT NULL,
  old_net            DECIMAL(12,2),
  new_net            DECIMAL(12,2) NOT NULL,
  status             ENUM('pending','ok','conflict','error') NOT NULL DEFAULT 'pending',
  reason             VARCHAR(500),
  changed_by         INT,
  changed_by_name    VARCHAR(255),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_price_change_log_job (job_id),
  INDEX idx_price_change_log_article (lexware_article_id),
  FOREIGN KEY (changed_by) REFERENCES employees(id) ON DELETE SET NULL
);
