-- #529: Freistellungen (Elternzeit, Sonderurlaub) für das Gleitzeitkonto.
-- An diesen Tagen ist das Soll 0, es wird nichts gebucht. Urlaubstage und Rentman bleiben unberührt.
-- Vorher Backup:  mariadb-dump radmin_randl_portal gleitzeit_buchungen > gleitzeit_vor_freistellung.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_gleitzeit_freistellung_529.sql (mehrfach ausführbar)
CREATE TABLE IF NOT EXISTS gleitzeit_freistellung (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT NOT NULL,
  von           DATE NOT NULL,
  bis           DATE NOT NULL,
  art           ENUM('elternzeit','sonderurlaub') NOT NULL,
  notiz         VARCHAR(255) NULL,
  erstellt_von  INT NULL,
  created_at    DATETIME DEFAULT NOW(),
  INDEX idx_employee_zeitraum (employee_id, von, bis),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (erstellt_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
