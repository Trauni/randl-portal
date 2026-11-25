## Gas-Auswertung (entfernt 25.11.2026, wird neu gedacht)

- Die Analyse-Seite (Gashandel → Auswertung), ihre API und die Rechen-Services sind entfernt. #454–#460 und #563 in OpenProject (`dr-gaspreis-analyse`) sind zurückgewiesen.
- Material für den Neuentwurf: `docs/gas-auswertung/` (Übergabe, Python-Referenz, aggregierte Abnahmewerte). Die DB-Tabellen `gas_beleg_position`, `gas_tour`, `gas_parameter`, `gas_pauschale_staffel`, `gas_sonderpreis`, `gas_kunde_geo` bleiben mit ihren Daten bestehen, werden aber vom Code nicht mehr gelesen.
- Rohdaten (Terminal-PDFs, Adressen, Geo-Cache) liegen nur auf `Y:\Gas-Preis-Analyse 2026` und kommen nicht ins Repo.
- Einkaufspreise bleiben im Portal: Reiter „Einkauf“ im Artikelstamm, API `/api/finance/ek-preise`, Recht `artikel.einkauf`, Tabelle `gas_ek_preis` mit Protokoll. Aktuell Tyczka: Propan 1,52 €/kg netto ab 11.11.2026; Motogas/Bluetec nach Liste.
- Einkaufspreise und Rohertrag sind intern: nur für berechtigte Rollen.
