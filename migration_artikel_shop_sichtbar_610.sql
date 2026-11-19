-- #610: Schalter "im Shop sichtbar" am Artikel (löst das Lexware-Präfix RG-/NRG- als Shop-Kennzeichen ab).
-- NULL = noch nicht gesetzt (bis dahin gilt weiter das Präfix). Pfand, Kaufflaschen und Provision sind standardmäßig aus.
-- Füllungen bleiben NULL, bis das Kennzeichen aus Lexware übernommen oder von Hand gesetzt wird. Es werden keine Daten gelöscht.

ALTER TABLE gas_artikel
  ADD COLUMN IF NOT EXISTS shop_sichtbar TINYINT(1) NULL COMMENT '1 im Shop sichtbar, 0 ausgeblendet, NULL noch nicht gesetzt (dann gilt das Lexware-Präfix)' AFTER aktiv;

UPDATE gas_artikel SET shop_sichtbar = 0 WHERE shop_sichtbar IS NULL AND typ IN ('P', 'S', 'V');
