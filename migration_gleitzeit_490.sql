-- #490 (06.11.2026): Gleitzeitkonto – Wochenarbeitszeit, Saldo, Gleitzeitabbau im Urlaubsantrag.
-- Ausführen: mariadb radmin_randl_portal < migration_gleitzeit_490.sql (mehrfach ausführbar)
--
-- Entscheidungen (OpenProject #490, Kommentare vom 06.11.2026):
--   - nur für zeiterfassung_quelle = 'portal'; Ist netto aus time_entries (ohne Krankheit)
--   - kein Soll an Wochenenden, bayerischen Feiertagen, Urlaub, Krankheit, Gleitzeitabbau
--   - Arbeitstage pro Mitarbeiter wählbar; Tages-Soll = Wochenstunden / Anzahl Arbeitstage
--   - alle Beträge in Minuten (INT), damit keine Rundungsfehler aufsummiert werden

-- 1. Mitarbeiter: Konto an/aus, Beginn, übernommener Kontostand.
--    Wochenstunden und Arbeitstage stehen NICHT hier, sondern mit Gültig-ab in der Historie (2.),
--    damit eine Änderung die Vergangenheit nicht verfälscht.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gleitzeit_aktiv TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '#490 Gleitzeitkonto aktiv (nur bei zeiterfassung_quelle = portal)',
  ADD COLUMN IF NOT EXISTS gleitzeit_seit DATE NULL
    COMMENT '#490 Konto wird ab diesem Tag (inklusive) berechnet, auch rückwirkend',
  ADD COLUMN IF NOT EXISTS gleitzeit_startsaldo_minuten INT NOT NULL DEFAULT 0
    COMMENT '#490 übernommener Kontostand zum Beginn, kann negativ sein';

-- 2. Historie der vereinbarten Arbeitszeit. Gültig ist pro Tag der Eintrag mit dem
--    jüngsten gueltig_ab <= Tag. Ohne gültigen Eintrag: kein Soll, keine Buchung.
CREATE TABLE IF NOT EXISTS gleitzeit_arbeitszeit (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT NOT NULL,
  gueltig_ab      DATE NOT NULL,
  wochenstunden   DECIMAL(5,2) NOT NULL COMMENT 'z. B. 40.00 oder 32.50',
  arbeitstage     VARCHAR(13) NOT NULL DEFAULT '1,2,3,4,5'
    COMMENT 'Wochentage, 0 = So … 6 = Sa (wie getUTCDay)',
  geaendert_von   INT NULL,
  created_at      DATETIME DEFAULT NOW(),
  UNIQUE KEY uq_employee_ab (employee_id, gueltig_ab),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (geaendert_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Buchungen. Kontostand = Startsaldo + SUM(minuten). Neuberechnung ersetzt die
--    Zeilen eines Tages (tagessaldo/abbau sind pro Tag eindeutig), Korrekturen von
--    Hand bleiben unberührt und dürfen mehrfach am selben Tag vorkommen.
CREATE TABLE IF NOT EXISTS gleitzeit_buchungen (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT NOT NULL,
  datum           DATE NOT NULL,
  art             VARCHAR(20) NOT NULL COMMENT 'tagessaldo | abbau | korrektur',
  minuten         INT NOT NULL COMMENT 'Plus = Mehrstunden, Minus = Minderstunden/Abbau',
  soll_minuten    INT NULL COMMENT 'nur tagessaldo: Soll des Tages',
  ist_minuten     INT NULL COMMENT 'nur tagessaldo: netto erfasste Arbeitszeit',
  quelle          VARCHAR(30) NOT NULL COMMENT 'tagesabschluss | neuberechnung | urlaubsantrag | hand',
  referenz_id     INT NULL COMMENT 'abbau: vacation_requests.id',
  notiz           VARCHAR(255) NULL,
  erstellt_von    INT NULL,
  created_at      DATETIME DEFAULT NOW(),
  updated_at      DATETIME DEFAULT NOW() ON UPDATE NOW(),
  -- Eindeutigkeit nur für automatische Arten; NULL fällt aus dem UNIQUE-Index.
  eindeutig       VARCHAR(40) AS (IF(art = 'korrektur', NULL, CONCAT(employee_id, '|', datum, '|', art))) PERSISTENT,
  UNIQUE KEY uq_eindeutig (eindeutig),
  INDEX idx_employee_datum (employee_id, datum),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (erstellt_von) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Urlaubsantrag: Art der Abwesenheit. Bestehende Anträge bleiben Urlaub.
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS art VARCHAR(20) NOT NULL DEFAULT 'urlaub'
    COMMENT '#490 urlaub | gleitzeitabbau' AFTER employee_id;

CREATE INDEX IF NOT EXISTS idx_vr_employee_art ON vacation_requests (employee_id, art);
