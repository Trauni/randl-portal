-- #490 (07.11.2026): Gleitzeitabbau stundenweise, z. B. halber Tag frei.
-- Ausführen: mariadb radmin_randl_portal < migration_gleitzeitabbau_stunden_490.sql (mehrfach ausführbar)
--
-- Nur bei art = 'gleitzeitabbau' und genau einem Tag (start_date = end_date).
-- Beide NULL = ganzer Tag (bisheriges Verhalten). Abgebucht wird die Dauer,
-- höchstens das Tages-Soll; um diese Minuten sinkt das Soll des Tages.
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS abbau_von TIME NULL COMMENT '#490 stundenweiser Gleitzeitabbau: von' AFTER end_date,
  ADD COLUMN IF NOT EXISTS abbau_bis TIME NULL COMMENT '#490 stundenweiser Gleitzeitabbau: bis' AFTER abbau_von;
