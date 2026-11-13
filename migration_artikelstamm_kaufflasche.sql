-- Artikelstamm: Kaufflasche je Füllung (z. B. 7801100 → 2801100). Wird mit der Füllung verkauft
-- (1 zu 1 oder 1 zu 0, nie Rücknahme/Pfand). In SER steht sie in steuer_produkt_id.
ALTER TABLE gas_artikel
  ADD COLUMN kaufflasche_artikel_nr VARCHAR(16) NULL COMMENT 'Flaschenartikel, der beim Verkauf der Füllung mit verkauft wird' AFTER pfand_artikel_nr,
  ADD INDEX idx_gas_artikel_kaufflasche (kaufflasche_artikel_nr);
