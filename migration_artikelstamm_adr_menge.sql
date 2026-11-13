-- Artikelstamm: ADR-Benennung (SER bezadr) und Füllmenge mit wählbarer Einheit.
-- SER führt die Menge in `inhalt` als Kombifeld: kg bei Brenngas/CO², Liter bei Technikgasen (Argon 10L).
-- inhalt_l bleibt vorerst stehen (Rückfall beim Deploy) und wird nicht mehr gelesen; später entfernen.
ALTER TABLE gas_artikel
  ADD COLUMN bezadr             VARCHAR(120)  NULL COMMENT 'ADR-Benennung für Beförderungspapier/Ladeliste (SER bezadr)' AFTER gefahrklasse,
  ADD COLUMN fuellmenge         DECIMAL(9,3)  NULL COMMENT 'Menge je Gebinde, Einheit in fuellmenge_einheit' AFTER fuellgewicht_kg,
  ADD COLUMN fuellmenge_einheit ENUM('kg','l') NULL AFTER fuellmenge;

-- Bestand: inhalt_l stammt aus dem SER-Kombifeld und ist bei Brenngas eigentlich kg → Einheit aus der Bezeichnung
UPDATE gas_artikel
   SET fuellmenge = inhalt_l,
       fuellmenge_einheit = IF(bezeichnung REGEXP '(^|[^[:alpha:]])kg([^[:alpha:]]|$)' AND bezeichnung NOT REGEXP '[0-9] ?(l|ltr|liter)([^[:alpha:]]|$)', 'kg', 'l')
 WHERE inhalt_l IS NOT NULL;
