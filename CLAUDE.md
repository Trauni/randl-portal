## Modul Gas-Auswertung (#460)

- OpenProject: Für dieses Modul gilt das Projekt `dr-gaspreis-analyse` (nicht `randlos`). Aufgaben #454–#460. Start mit `/kickoff #460`.
- Übergabe und Abnahmewerte: `docs/gas-auswertung/HANDOFF-460.md`. Rechenlogik als Python-Referenz in `docs/gas-auswertung/referenz/python/`, erwartete Zahlen in `docs/gas-auswertung/referenz/beispieldaten/`.
- Rohdaten (Terminal-PDFs, Adressen, Geo-Cache) liegen nur auf `Y:\Gas-Preis-Analyse 2026` und kommen nicht ins Repo.
- Einkaufspreise werden im Portal gepflegt (`gas_ek_preis`, mit Gültigkeitsdatum und Protokoll), nicht im Code. Aktuell Tyczka: Propan 1,52 €/kg netto ab 11.11.2026; Motogas/Bluetec nach Liste.
- Verkaufspreise aus `ser_product_master` / `price_change_log`.
- Rohertrag und Einkaufspreise sind intern: Seiten und API nur für berechtigte Rollen.
