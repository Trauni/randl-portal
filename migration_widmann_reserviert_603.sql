-- #603: Widmann-Zählung um "reserviert" erweitern (bereits an Kunden vergebene Flaschen).
-- Nachliefern wird nicht gespeichert, sondern aus Mindestbestand, gezählt und reserviert berechnet.
ALTER TABLE widmann_stock_check_entries
  ADD COLUMN IF NOT EXISTS reserviert INT NOT NULL DEFAULT 0 AFTER gezaehlt;
