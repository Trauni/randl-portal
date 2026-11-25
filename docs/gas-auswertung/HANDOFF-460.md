# #460 Gas-Auswertung im Mitarbeiterportal – Übergabe an Claude Code

> **Stand 25.11.2026:** Die Umsetzung im Portal ist entfernt, das Thema wird neu gedacht. Dieses Dokument und `referenz/` bleiben als Material. Erhalten geblieben ist nur die Pflege der Einkaufspreise (Artikelstamm → Einkauf, `/api/finance/ek-preise`).

Stand 11.11.2026. Ziel: Die Analyse- und Berechnungs-Dashboards „Gas-Auswertung“ (bisher Prototyp auf claude.ai) ins Mitarbeiterportal einbauen. Dazu kommen laufende Datenzufuhr und **Eingabefelder für Einkaufspreise**, damit Preisänderungen ohne Code-Änderung wirken.

- **OpenProject:** Projekt `dr-gaspreis-analyse`, Arbeitspaket **#460** (https://projects.randlweb.de/work_packages/460). Vorarbeit: #454–#459.
- **Prototyp (nur Referenz):** https://claude.ai/artifact/NcLQzNScuZWaQSc5VENMEq, Quelltext in `referenz/dashboard-prototyp.html`.
  - Er läuft in einer Artifact-Umgebung (`dash.data`, `dash.calc`, `dash.draw`, d3 v7). Übernommen werden Aufbau, Kennzahlen und Rechenlogik, nicht diese Laufzeitumgebung.
  - Der Prototyp zeigt noch die Tyczka-Liste ab 15.11. und die Varianten A–D. Maßgeblich sind die Einkaufspreise und Varianten in diesem Dokument und in `referenz/python/`.
- **Rechenlogik (Referenz):** `referenz/python/` mit den Python-Skripten der Auswertung. Sie müssen in Node portiert werden.
- **Erwartete Zahlen:** `referenz/beispieldaten/` enthält aggregierte JSON-Dateien für 01.01.–03.11.2026, ohne Kundendaten. Sie dienen als Testwerte (siehe „Abnahme“).
- **Rohdaten und Skripte:** `Y:\Gas-Preis-Analyse 2026` (früher `Y:\GAS`). Diese Rohdaten kommen nicht ins Repo.

## Portal (vor dem Start im Repo prüfen, der Ist-Zustand im Code gilt)
- Node.js/Express, PM2-Prozess `randlweb-portal`, Port 3336, `server.js` unter `/home/radmin/web/randlweb.de/public_html/portal/`
- Login über OIDC gegen Authentik (`auth.randlweb.de`, App `portal`)
- Frontend als SPA-Build in `portal/dist/`; bestehende API-Routen z. B. `/api/me`, `/api/dashboard`
- Datenbank `radmin_randl_portal` (MariaDB) mit `ser_product_master` (prodnr, `preis_cent` = Netto-Listenpreis Füllung) und `price_change_log` (Preishistorie, Artikelnr. `RG-<prodnr>`)
- Design: randl.group, helle Variante (Farben und Schriften unten)

## Seitenaufbau
1. **Überblick:** Kacheln für Umsatz alle Gase, Touren, Stopps, km, Lieferkosten, Flaschen alle Gase, Rohertrag Propan. Diagramme: Umsatz je Monat (Tour/Lager gestapelt), Touren/Stopps/km je Monat, Umsatz nach Produktgruppe, Propan-Stopps nach kg-Klasse (Rohertrag, Lieferkosten, Übrig je Stopp), Rohertrag und Marge je Monat, Einkaufspreis-Historie.
2. **Flaschen:** alle Gase, Tour und Lager. Kacheln (Flaschen, Ø Woche, 90 %-Woche, Ø Monat, Propan t). Dazu eine Tabelle je Gasart, ein Verlauf je Woche und je Monat mit Gasart-Auswahl und eine Tabelle je Artikel. Die Artikeltabelle hat Filter für Kategorie (Propan / Technisch und sonstige), Gasart, Größe und Suche, sortierbare Spalten und eine Summenzeile. Grundlage für Angebote anderer Lieferanten.
3. **Preismodell:** eine Tabelle der Varianten und ein Simulator.
   - Eingaben: Gaspreisänderung (−10 bis +10 %) und Pauschale je Stufe.
   - Ausgaben: Rohertrag, Δ zum Vergleichsstand, Pauschalen, nötige Gaspreisänderung, Kunden über +10 %, Preistabelle, Wirkung je kg-Klasse, größte Gewinner/Verlierer.
   - Der Simulator rechnet mit den **aktuell gültigen Einkaufspreisen aus der Datenbank**. Der Vergleichsstand (Standard: Einkauf ab 15.10.2026) ist wählbar.
4. **Einkaufspreise (neu, Pflicht im MVP):** Pflegemaske, siehe nächster Abschnitt.
5. **Methodik:** Annahmen, Datenquellen, Grenzen.

## Einkaufspreise pflegen (neu)
Neue Einkaufspreise kommen oft kurzfristig: Monatsmitteilungen von Tyczka oder Verhandlungsergebnisse. Deshalb Eingabe im Portal statt im Code.
- **Maske „Einkaufspreise“** (nur berechtigte Rolle):
  - Felder: Lieferant, Preisgruppe, **Preisbasis** (je kg oder je Füllung), Preis netto, gültig ab, Notiz (z. B. „verhandelt, unbefristet“)
  - Liste aller Preise mit Historie, aktueller Preis je Gruppe hervorgehoben
  - Jede Änderung mit Benutzer und Zeitpunkt protokollieren. Kein Überschreiben alter Stände, neue Zeile mit neuem `gueltig_ab`.
- **Preisgruppen:**
  - `propan` je kg: gilt für alle Brenngas-Größen 5, 8, 11, 19 und 33 kg (Pfand, Camping, Alugas, BBQ)
  - `motogas` je Füllung: Motogas und Bluetec
  - Später je Füllung auch für CO2, Biergas und technische Gase (Preise noch nicht erfasst)
- **Berechnung:** EK je Flasche am Tag t = Preis mit dem größten `gueltig_ab` ≤ t, × `kg_fuellung` (Preisbasis kg) bzw. direkt (Preisbasis Füllung).
- **Startwerte (Tyczka):**
  - Historie bis 15.10.2026 je Füllung: `referenz/beispieldaten/ek_historie.json`
  - **ab 11.11.2026: Propan 1,52 €/kg netto**, verhandelt, unbefristet
  - Motogas/Bluetec nach Liste: 20,79 € bis 14.11., **22,55 € ab 15.11.2026**
- **Ebenfalls editierbar:** Pauschalen-Staffeln (S, S+) und die Werte des Lieferkosten-Modells. Verkaufspreise werden nur angezeigt (Quelle `price_change_log`).

## Lexware prüfen (vor einem Sync)
Klären, ob Einkaufspreise mit Lexware abgeglichen werden können. Ergebnis als Kommentar in #460 oder als eigenes Arbeitspaket.
- Führt die Lexware-API am Artikel einen Einkaufspreis, und ist er per API schreib- und lesbar?
- Welche Richtung: Portal führend und Lexware übernimmt, oder umgekehrt?
- Wie werden die Artikel zugeordnet: SER-Produktnr. ↔ Lexware-Artikel; Propan je kg ↔ Preis je Flasche?
- Rate Limits und Zugangsweg. Zugangsdaten nur in der Server-Konfiguration, nie im Repo.
- Bis das geklärt ist, gilt die Pflege im Portal als einzige Quelle.

## Datenmodell (Entwurf: `schema/gas_auswertung.sql`)
- `gas_beleg_position`: eine Zeile je Belegposition aus dem Versorger-Portal
- `gas_barbeleg`: Barbeleg mit Betrag (aus der Komplettstatistik)
- `gas_tour`: Touren mit Terminal und Datum
- `gas_artikel`: Gasart, Kategorie, Größe, Füllmenge in kg, Preisgruppe
- `gas_ek_preis`: Einkaufspreis je Lieferant, Preisgruppe, Preisbasis und `gueltig_ab`, mit Protokoll
- `gas_pauschale_staffel`, `gas_parameter`: Staffeln und Lieferkosten-Modell
- `gas_kunde_geo`: Koordinaten und Entfernung je Kunde. Bleibt nur in der Datenbank.

Verkaufspreise am Belegtag kommen aus `price_change_log`. Für Januar bis April 2026 fehlen sie dort teilweise. Die Werte, die aus Barbelegen abgeleitet wurden, stehen in `referenz/python/historie.py` (`A`, `PREOCT`).

## Datenzufuhr
- **Heute:** PDF „Komplettstatistik“ je Terminal (6441–6444) aus dem Versorger-Portal (#70). `parse.py` liest es mit `pdftotext -layout` und Regex. Die Bareinnahmen stehen im selben PDF. Die Tourliste wurde aus Screenshots abgetippt.
- **Ziel:** ein monatlicher Import, idempotent und als Upsert.
  1. Upload der Komplettstatistik-PDFs oder eines CSV-Exports, falls das Versorger-Portal einen anbietet (**offen**)
  2. Touren: Eingabemaske oder CSV-Import (Datum, Terminal, Bezeichnung, Plan-kg, Bestellungen)
  3. Einkaufspreise: über die Pflegemaske

## Regeln der Auswertung
- **Belegart:**
  - Tour: Terminal und Datum passen zu einer Tour. Ohne Belege am Tourtag wird ±3 Tage gesucht (`match.py`).
  - Lager: Kunden 125001, 125218, 125222 oder Terminal 6444.
  - Rest: „Tablet ohne Tour“.
  - Belegtyp L = Lieferschein, Q = Barverkauf, „L r“ = Rücknahme.
- **Stopp:** Terminal + Datum + Kunde. Stopps ohne Netto-Lieferung (Rücknahmen) zählen beim Preismodell zur Abholung.
- **Lieferkosten je Stopp** = `km_je_stopp × eur_je_km + (fahr_min + stand_min + min_je_flasche × Flaschen) / 60 × eur_je_h`
  - Werte: 12,65 km · 0,40 €/km (Annahme) · 15,4 min · 9 min · 0,6 min · 20 €/h
- **Preismodell:**
  - `Umsatz neu = Σ VK × (1 − Senkung) + Σ Pauschale(kg je Stopp)`
  - `Rohertrag = Umsatz − Σ EK`
  - `nötige Gaspreisänderung = (EK aktuell − EK Vergleichsstand − Pauschalen) / Umsatz`
  - Kundenwirkung gegen heute
- **Staffel-Grenzen:** bis 11 kg · bis 33 kg · bis 66 kg · bis 99 kg · ab 100 kg
- **Flaschen:**
  - volle Flaschen nach Rücknahmen, ohne Paletten (2805400, 2805600) und Kappen (5904000)
  - Wochen = volle ISO-Kalenderwochen; 90 %-Woche = Quantil 0,9 mit linearer Interpolation (wie pandas)
  - Kategorie Propan = Gasart beginnt mit „Propan“ (Brenngas, Camping, Alugas, BBQ, Motogas, Bluetec)
- **Rohertrag 2026 rückwirkend:** Einkauf je Gültigkeitsperiode, Verkaufspreis am Belegtag, Sonderpreise bekannter Barkunden (`historie.py`, `SONDER`)

## Abnahme: diese Zahlen muss der Port für 01.01.–03.11.2026 liefern
| Kennzahl | Wert |
|---|---|
| Touren / Stopps mit Ware / km optimal | 197 / 1.338 / 17.180 |
| Umsatz alle Gase (Listenpreis am Belegtag) | 295.877 € |
| Flaschen alle Gase (voll / leer) | 7.215 / 6.981 |
| Propan / Treibgas / CO2 Flaschen | 5.462 / 746 / 598 |
| Ø Flaschen je Woche / 90 %-Woche / Ø je Monat | 167,3 / 237,8 / 721,4 |
| Propan-Stopps / Lieferkosten Propan | 1.029 / 14.706 € |
| Propan-Umsatz zu VK Okt. | 258.267 € |
| Rohertrag mit EK ab 15.10. (Vergleichsstand) | 119.151 € |
| Rohertrag mit Tyczka-Liste ab 15.11. (Propan 18,70 €/11 kg) | 104.996 € |
| **Rohertrag mit Propan 1,52 €/kg, Motogas 22,55 €** | **119.444 €** |
| Pauschalen Staffel S / S+ | 10.164 € / 15.292 € |
| V1 Abholpreis −4 % + S / V2 −6 % + S+ / V3 −10 % + S+ (EK 1,52) | 119.430 € / 119.415 € / 108.878 € |
| Rohertrag Propan Jan.–Okt. rückwirkend | 106.655 € (45,7 %) |

Die Einzelwerte je Monat, Woche, Artikel und Variante stehen in `referenz/beispieldaten/`. Die Varianten in `preisvarianten.json` sind mit EK 1,52 €/kg gerechnet.

## Design (randl.group, hell)
- **Farben:** Hintergrund `#f5f5f0`, Karten `#ffffff`, Text `#262626`, gedämpft `#6b6b68`, Linien `#e0ddd8`, Akzent/Marke `#cc0000`, zweite Serie `#2b4a7a`, gut `#1d7a4c`, Warnung `#b06a00`. Dunkel: Hintergrund `#09090c`, Karten `#111520`, Akzent `#ff4d4d`.
- **Schriften:** Überschriften `Barlow Condensed` 700 in Großbuchstaben, große Zahlen `Bebas Neue`, Text `DM Sans` (Google Fonts)
- Zahlen im deutschen Format, Beträge netto. Tabellen mit Ziffern in gleicher Breite (`font-variant-numeric: tabular-nums`).

## Feste Regeln
- Keine Zugangsdaten oder Tokens im Code, in OpenProject oder BookStack.
- Keine Kundenadressen und keine Rohdaten aus `Y:\Gas-Preis-Analyse 2026` ins Repo. Testdaten nur aggregiert (wie `beispieldaten/`). Kundennummern nur in der Datenbank.
- Geokodierung (Nominatim) und Routen (OSRM) nur mit Adressen ohne Namen.
- Seite und API nur für berechtigte Rollen, denn Rohertrag und Einkaufspreise sind intern. Die Rolle ist mit Trauni zu klären.

## Offen
- Bietet das Versorger-Portal einen CSV- oder API-Export für Belege und Touren?
- Welche Portal-Rolle darf die Seiten sehen und welche darf Einkaufspreise ändern?
- Lexware-Abgleich der Einkaufspreise (siehe oben)
- Einkaufspreise für CO2, Biergas und technische Gase
- Kosten je km aus Tank- und Werkstattbelegen
- Sonderpreise von Kunden auf Rechnung (Lexware)
