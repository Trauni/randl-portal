-- Mitteilungen (Inbox), Web-Push-Anmeldungen und Einstellungen pro Person.
-- Aufruf: mysql <db> < migration_mitteilungen.sql  (idempotent)

CREATE TABLE IF NOT EXISTS mitteilung (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT NOT NULL,
  art           VARCHAR(40) NOT NULL COMMENT 'urlaub_antrag | urlaub_entscheidung | bestellung_neu',
  titel         VARCHAR(200) NOT NULL,
  text          VARCHAR(500) NULL,
  link          VARCHAR(255) NULL COMMENT 'Pfad im Mobile-Portal, z. B. /mobile/#/freigaben',
  gelesen_am    DATETIME NULL,
  erstellt_am   DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_mit_emp (employee_id, gelesen_am, erstellt_am)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscription (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT NOT NULL,
  endpoint      VARCHAR(700) NOT NULL,
  p256dh        VARCHAR(255) NOT NULL,
  auth          VARCHAR(255) NOT NULL,
  user_agent    VARCHAR(255) NULL,
  erstellt_am   DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_push_endpoint (endpoint(255)),
  INDEX idx_push_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fehlt eine Zeile, gelten die Standardwerte aus src/services/mitteilungen.js
CREATE TABLE IF NOT EXISTS mitteilung_einstellung (
  employee_id   INT NOT NULL,
  art           VARCHAR(40) NOT NULL,
  inbox         TINYINT(1) NOT NULL DEFAULT 1,
  push          TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (employee_id, art)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Welche Quell-Datensätze (z. B. Shop-Bestellungen) schon gemeldet wurden
CREATE TABLE IF NOT EXISTS mitteilung_quelle_gesehen (
  quelle        VARCHAR(40) NOT NULL,
  ref           VARCHAR(100) NOT NULL,
  gesehen_am    DATETIME NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quelle, ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
