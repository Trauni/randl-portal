-- #529: Zeiterfassung läuft standardmäßig über das Portal (Rentman ist nur Spiegel).
-- Vorher Backup:  mysqldump radmin_randl_portal employees > employees_vor_529.sql
-- Ausführen:      mariadb radmin_randl_portal < migration_zeiterfassung_default_portal_529.sql (mehrfach ausführbar)

-- 1) Neue Mitarbeiter starten auf 'portal'
ALTER TABLE employees
  MODIFY COLUMN zeiterfassung_quelle ENUM('rentman','portal') NOT NULL DEFAULT 'portal';

-- 2) Tippfehler in der E-Mail (raimung -> raimund), sonst legt der SSO-Login ggf. einen zweiten User an
UPDATE employees SET email = 'raimund.soellner@randl.group'
 WHERE id = 28 AND LOWER(email) = 'raimung.soellner@randl.group';

-- 3) Raimund Söllner (ID 28) auf Portal umstellen
UPDATE employees SET zeiterfassung_quelle = 'portal' WHERE id = 28;

-- 4) Weitere Bestandsmitarbeiter NICHT automatisch: erst Zeiten/Urlaub je Person prüfen (Urlaubsbemessung ändert sich).
--    Danach pro Person:  UPDATE employees SET zeiterfassung_quelle = 'portal' WHERE id = <id>;
