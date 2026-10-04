-- Randl Portal – Datenbankschema
-- Ausführen: mysql -u radmin_randl_portal_user -p radmin_randl_portal < schema.sql

SET NAMES utf8mb4;
SET time_zone = '+01:00';

-- ── Mitarbeiter ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  authentik_uid    VARCHAR(255) UNIQUE NOT NULL COMMENT 'Authentik sub claim',
  username         VARCHAR(100) NOT NULL,
  full_name        VARCHAR(255),
  email            VARCHAR(255),
  phone            VARCHAR(50),
  position_title   VARCHAR(255),
  department       VARCHAR(100),
  start_date       DATE,
  created_at       DATETIME DEFAULT NOW(),
  updated_at       DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_authentik_uid (authentik_uid),
  INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Urlaubsanträge ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacation_requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  days_count     INT NOT NULL,
  reason         TEXT,
  status         VARCHAR(20) DEFAULT 'pending' COMMENT 'pending | approved | rejected',
  approved_by    INT,
  approved_at    DATETIME,
  note           TEXT COMMENT 'Kommentar des Genehmigenden',
  created_at     DATETIME DEFAULT NOW(),
  INDEX idx_employee (employee_id),
  INDEX idx_status (status),
  INDEX idx_dates (start_date, end_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Dokumente ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT NOT NULL,
  title        VARCHAR(255) NOT NULL,
  category     VARCHAR(100) COMMENT 'Vertrag | Zeugnis | Lohnabrechnung | Sonstiges',
  file_path    TEXT,
  uploaded_at  DATETIME DEFAULT NOW(),
  INDEX idx_employee (employee_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
