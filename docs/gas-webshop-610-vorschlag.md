# Vorschlag für gas-webshop: Schalter „im Shop sichtbar“ (#610)

Dies ist **nur eine Beschreibung**. Im Repo `gas-webshop` wurde nichts geändert. Umsetzen und einspielen nach Rücksprache.

## Ausgangslage

- Im Artikelstamm des Portals (`gas_artikel`) gibt es seit #610 das Feld `shop_sichtbar` (1 sichtbar, 0 ausgeblendet, NULL noch nicht gesetzt).
- Der Shop richtet sich weiter nach dem Lexware-Präfix:
  - `backend/src/routes/products.js`: `ARTICLE_PREFIX` (Standard `RG-`), Abruf mit `lexware.getArticlesByPrefix(ARTICLE_PREFIX)`, 5 Minuten Cache. Das ist der Katalog im Kundenshop.
  - `admin-backend/src/routes/products.js`: `GET /admin/products` (Suche für die Bestellerfassung) und `GET /admin/products/all?prefix=RG-,NRG-` (Preis-Tool, Artikelliste im Portal).
  - `admin-backend/src/services/ser-xml.js`: entfernt `ARTICLE_PREFIX` von der Artikelnummer für SER („RG-11“ wird „11“).
- Das Portal filtert die Artikelauswahl der Portal-Bestellung selbst auf `RG-` (`src/routes/api/finance/products.js`).

## Was das Portal schon bereitstellt (nur lesend, ohne Wirkung auf den Shop)

`GET /internal/artikel/shop-sichtbar` am internen Listener des Portals (Port `INTERNAL_PORT`, Bridge `INTERNAL_BIND_IP`, von außen nicht erreichbar), Header `x-internal-artikel-secret: <INTERNAL_ARTIKEL_SECRET>` (min. 32 Zeichen, gleicher Wert in der Shop-`.env`). Antwort:

```json
{ "stand": "2026-11-19T20:00:00.000Z", "artikel": { "7801100": true, "7801200": false } }
```

Enthalten sind nur Artikel mit gesetztem Wert. Schlüssel ist die Artikelnummer ohne Präfix (wie in SER und im Stamm). Ohne Secret in der Portal-`.env` antwortet die Route mit 503, mit falschem Secret mit 401.

## Änderungen im Shop (Vorschlag, klein halten)

1. **Neuer Dienst** `shopKennzeichen` im Shop-Backend: ruft die Portal-Route alle 5 Minuten ab (gleicher Takt wie der Artikel-Cache), merkt den letzten guten Stand und liefert `sichtbar(articleNumber)`:
   - Nummer ohne Präfix bilden (`RG-7801100` und `NRG-7801100` werden `7801100`).
   - Wert im Stamm gesetzt: der Wert gilt.
   - Kein Wert, Portal nicht erreichbar oder noch kein Stand: **bisherige Regel** (Präfix `RG-` = sichtbar). So kann der Shop nie leer werden.
2. **Katalog im Kundenshop** (`backend/src/routes/products.js`): Lexware nicht mehr nur nach Präfix `RG-` abrufen, sondern `RG-` und `NRG-` laden und dann mit `sichtbar()` filtern. Das ist der einzige Teil, der das Verhalten für Kunden ändert; er sollte erst eingeschaltet werden, wenn im Portal die Kennzeichen geprüft sind (Schalter, z. B. `SHOP_KENNZEICHEN_AKTIV=1`).
3. **Bestellerfassung** (`admin-backend/src/routes/products.js`, `GET /admin/products`): gleiche Filterung. Das Portal filtert seine Artikelauswahl bisher selbst auf `RG-` (`src/routes/api/finance/products.js`); dort folgt dann ein kleiner Schritt im Portal, sobald der Shop umgestellt ist.
4. **SER-Export der Bestellung** (`ser-xml.js`): Artikelnummer nur ohne Präfix bilden, unabhängig davon, ob `RG-` oder `NRG-`. Bisher können Bestellungen nur `RG-`-Artikel enthalten; sobald ein ehemaliger `NRG-`-Artikel sichtbar wird, muss SER diese Nummer kennen (Artikel in SER vorhanden?). Das ist vorher pro Artikel zu prüfen.

## Reihenfolge und Risiken

1. Portal v1.22.0 einspielen, in der Artikelliste „Shop-Kennzeichen aus Lexware übernehmen“ ausführen und Abweichungen ansehen (Zu erledigen: „… anderes Shop-Kennzeichen als in Lexware“).
2. `INTERNAL_ARTIKEL_SECRET` in beide `.env` eintragen, Portal neu starten.
3. Shop-Änderung 1 einspielen (nur lesen, noch ohne Wirkung), im Log prüfen, dass der Stand ankommt.
4. Shop-Änderungen 2 bis 4 hinter dem Schalter einspielen, erst im Test, dann umschalten.
5. Danach (eigener Schritt, nicht Teil von #610): Name, Preis und MwSt. vom Portal nach Lexware schreiben (Zuordnung Lexware-ID zu Artikelnummer im Stamm speichern, #561), Präfix wird Altlast. Das braucht Rücksprache, weil es Schreibwege nach Lexware betrifft.

Risiken: ein falsch auf „sichtbar“ gesetzter Artikel erscheint für Kunden im Shop (Pfand und Leerflaschen sind dafür standardmäßig auf „aus“); SER muss neue sichtbare Artikel kennen; der 5-Minuten-Cache heißt, Änderungen im Portal wirken im Shop mit Verzögerung.
