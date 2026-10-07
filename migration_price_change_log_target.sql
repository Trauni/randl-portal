-- #261 (07.10.2026): Preisprotokoll unterscheidet das Ziel – Lexware (#254) oder SER (STMUPD-Push).
-- Bei SER steht in job_id die Push-ID, in reason der Dateiname der STMUPD-Datei.

ALTER TABLE price_change_log
  ADD COLUMN target ENUM('lexware','ser') NOT NULL DEFAULT 'lexware' AFTER job_id;
