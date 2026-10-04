# Randl Portal

Mitarbeiterportal der Firma Dominik Randl (randlweb.de): Rechte, Zeiterfassung, Urlaubsanträge, Bestellungen. Node.js/Express-Backend, React-Frontends (Desktop und mobil), Login über Authentik (OIDC), Betrieb mit PM2.

## Aufbau

- `server.js`, `src/` – Backend (Routen in `src/routes`, Logik in `src/services`)
- `client/`, `client-mobile/` – React-Frontends (Build landet in `dist/` bzw. `dist-mobile/`, nicht im Repo)
- `schema.sql`, `migration_*.sql` – Datenbankstruktur und Migrationen (keine Daten)
- `scripts/`, `docs/`, `ecosystem.config.js` – Hilfsskripte, Notizen, PM2-Konfiguration

## Betrieb

- Server: `/home/radmin/web/randlweb.de/public_html/portal`
- PM2-Prozess: `randlweb-portal`, Port 3336 (interner SER-Push-Listener auf 3338)
- Neustart: `pm2 restart randlweb-portal`, Log: `pm2 logs randlweb-portal`

## Konfiguration

Alle Zugangsdaten stehen in der `.env` (nie committen, Vorlage: `.env.example`). Die Werte liegen im Passwortmanager (KeePass, Gruppe `Randl/Portal`). Gruppen der Variablen: App und Session, OIDC/Authentik, MariaDB, Gas-Shop-DB (`GAS_DB_PASS`, Postgres auf 127.0.0.1:5433), Cloudflare, HestiaCP, Shop-Admin, Rentman, Shopware-DB, SER-SFTP und -Push, BookStack, Authentik-API.

## Neuaufsetzen

1. `git clone` des Repos, `cp .env.example .env` und Werte aus KeePass eintragen
2. `mkdir -p storage/lieferantenauftraege` (Ordner ist nicht im Repo)
3. `npm install` im Hauptordner und in `client/` und `client-mobile/`, Frontends bauen (siehe jeweilige `package.json`)
4. `pm2 start ecosystem.config.js`

## Regeln

- Keine Zugangsdaten im Code. Nie `.env`, Dumps, Uploads, Backups oder echte Mitarbeiter- und Kundendaten committen.
- Keine `.bak`-Kopien anlegen, die Versionierung übernimmt Git.
- Vor jedem Commit läuft gitleaks als Pre-commit-Hook (`.git/hooks/pre-commit`, siehe unten).
- Ablauf: `git add -A && git commit -m "…" && git push`

Pre-commit-Hook einrichten:

```sh
#!/bin/sh
docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:latest protect -s /repo --staged --redact --log-level warn || { echo "gitleaks: moeglicher Secret-Fund, Commit abgebrochen"; exit 1; }
```

## Offen

- Gas-DB: Portal auf eigenen DB-User umstellen, `gasadmin` rotieren (OpenProject #232)
