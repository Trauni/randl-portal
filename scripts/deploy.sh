#!/usr/bin/env bash
# Portal einspielen: Sicherung, git pull, neue Migrationen, Builds, Neustart, Health-Check.
# Aufruf auf dem Server als root:  scripts/deploy.sh [--dry-run]
set -euo pipefail

PORTAL_DIR="${PORTAL_DIR:-/home/radmin/web/randlweb.de/public_html/portal}"
BACKUP_DIR="${BACKUP_DIR:-/root/portal-backups}"
BACKUP_TAGE=14
PM2_NAME="randlweb-portal"
HEALTH_URL="http://localhost:3336/api/health"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) echo "Aufruf: scripts/deploy.sh [--dry-run]"; exit 0 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

log()  { echo "==> $*"; }
fail() { echo "FEHLER: $*" >&2; exit 1; }
# Im Probelauf wird nur angezeigt, was passieren würde.
run()  { if [ "$DRY_RUN" = 1 ]; then echo "    [dry-run] $*"; else "$@"; fi; }

[ "$DRY_RUN" = 1 ] || [ "$(id -u)" = 0 ] || fail "bitte als root ausführen"
cd "$PORTAL_DIR" || fail "Ordner $PORTAL_DIR nicht gefunden"
[ -f .env ] || fail ".env fehlt in $PORTAL_DIR"

# --- Datenbank: wie überall bei uns als root über den Unix-Socket (BookStack Seite 30: mariadb -u root <db>) ---
# Nur den Namen der Datenbank lesen wir aus .env (mit dotenv, wie das Portal). Kein Passwort nötig.
DB_NAME_W=$(node -e "const v=require('dotenv').parse(require('fs').readFileSync('.env')).DB_NAME; process.stdout.write(v==null?'':v)")
[ -n "$DB_NAME_W" ] || fail "DB_NAME fehlt in .env"

# Neuere MariaDB-Installationen melden die alten Programmnamen als veraltet
CLIENT=mysql; command -v mariadb >/dev/null 2>&1 && CLIENT=mariadb
DUMP=mysqldump; command -v mariadb-dump >/dev/null 2>&1 && DUMP=mariadb-dump

sql()       { "$CLIENT" -u root "$DB_NAME_W" -N -B -e "$1"; }
sql_datei() { "$CLIENT" -u root "$DB_NAME_W" < "$1"; }

# --- 1. Arbeitsverzeichnis sauber? ---
log "Prüfe git status"
if [ -n "$(git status --porcelain)" ]; then
  git status --short >&2
  fail "Arbeitsverzeichnis nicht sauber, Abbruch"
fi
VORHER=$(git rev-parse HEAD)
VERSION_VORHER=$(node -p "require('./package.json').version")
echo "    Stand vorher: $(git rev-parse --short HEAD), Version $VERSION_VORHER"

# --- 2. Sicherung ---
STAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_DATEI="$BACKUP_DIR/portal-$STAMP.sql.gz"
log "Sicherung nach $BACKUP_DATEI (${BACKUP_TAGE} Tage Aufbewahrung)"
if [ "$DRY_RUN" = 1 ]; then
  echo "    [dry-run] $DUMP | gzip, ältere Sicherungen als ${BACKUP_TAGE} Tage löschen"
else
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  ( umask 077
    "$DUMP" -u root --single-transaction --routines --triggers "$DB_NAME_W" | gzip > "$BACKUP_DATEI" )
  [ -s "$BACKUP_DATEI" ] || fail "Sicherung ist leer"
  find "$BACKUP_DIR" -maxdepth 1 -name 'portal-*.sql.gz' -mtime +"$BACKUP_TAGE" -delete
  echo "    ok ($(du -h "$BACKUP_DATEI" | cut -f1))"
fi

# --- Beim ersten Lauf: schon vorhandene Migrationen als eingespielt markieren ---
# Wichtig: vor dem git pull, sonst würden neue Dateien fälschlich als erledigt gelten.
log "Prüfe schema_migrations"
TABELLE_DA=$(sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'")
if [ "$TABELLE_DA" = 0 ]; then
  ANZAHL=$(ls migration_*.sql 2>/dev/null | wc -l)
  echo "    Erster Lauf: Tabelle anlegen, $ANZAHL vorhandene Migrationen als eingespielt eintragen (nicht ausführen)"
  if [ "$DRY_RUN" = 0 ]; then
    sql "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    for datei in migration_*.sql; do
      [ -e "$datei" ] || continue
      sql "INSERT IGNORE INTO schema_migrations (name) VALUES ('$datei')"
    done
  fi
fi

# --- 3. Aktualisieren ---
log "git pull --ff-only"
if [ "$DRY_RUN" = 1 ]; then
  git fetch -q
  echo "    Neue Commits:"; git log --oneline HEAD..@{u} | sed 's/^/      /'
  NACHHER=$(git rev-parse '@{u}')
else
  git pull -q --ff-only
  NACHHER=$(git rev-parse HEAD)
fi
[ "$VORHER" = "$NACHHER" ] && echo "    keine Änderungen" || echo "    $(git rev-parse --short "$VORHER") -> $(git rev-parse --short "$NACHHER")"

geaendert() { ! git diff --quiet "$VORHER" "$NACHHER" -- "$@"; }

# --- 4. Neue Migrationen ---
log "Neue Migrationen"
OFFEN=()
if [ "$DRY_RUN" = 1 ]; then
  if [ "$VORHER" != "$NACHHER" ]; then
    while IFS= read -r datei; do OFFEN+=("$datei"); done < <(git diff --name-only --diff-filter=A "$VORHER" "$NACHHER" -- 'migration_*.sql' | LC_ALL=C sort)
  fi
else
  for datei in $(ls migration_*.sql 2>/dev/null | LC_ALL=C sort); do
    schon=$(sql "SELECT COUNT(*) FROM schema_migrations WHERE name = '$datei'")
    [ "$schon" = 0 ] && OFFEN+=("$datei")
  done
fi
if [ "${#OFFEN[@]}" = 0 ]; then
  echo "    keine"
else
  for datei in "${OFFEN[@]}"; do
    echo "    $datei"
    if [ "$DRY_RUN" = 0 ]; then
      sql_datei "$datei" || fail "Migration $datei fehlgeschlagen, Abbruch (Sicherung: $BACKUP_DATEI)"
      sql "INSERT INTO schema_migrations (name) VALUES ('$datei')"
    fi
  done
fi

# --- 5. Abhängigkeiten und Builds ---
log "Backend: npm ci"
run npm ci --no-audit --no-fund

log "Desktop-Frontend bauen"
run bash -c 'cd client && npm ci --include=dev --no-audit --no-fund && npm run build'

if [ ! -d dist-mobile ] || geaendert client-mobile; then
  log "Mobil-Frontend bauen"
  run bash -c 'cd client-mobile && npm ci --include=dev --no-audit --no-fund && npm run build'
else
  log "Mobil-Frontend unverändert, übersprungen"
fi

# --- 6. Neustart und Health-Check ---
log "Neustart: pm2 restart $PM2_NAME"
run pm2 restart "$PM2_NAME" --update-env

if [ "$DRY_RUN" = 1 ]; then
  log "Probelauf beendet, nichts verändert (außer git fetch)"
  exit 0
fi

log "Health-Check"
for _ in $(seq 1 20); do
  if ANTWORT=$(curl -sf "$HEALTH_URL"); then
    echo "    $ANTWORT"
    VERSION=$(node -pe "JSON.parse(process.argv[1]).version" "$ANTWORT" 2>/dev/null || echo "?")
    SOLL=$(node -p "require('./package.json').version")
    [ "$VERSION" = "$SOLL" ] || fail "läuft mit Version $VERSION, erwartet $SOLL (pm2 logs $PM2_NAME prüfen)"
    log "Fertig: Portal läuft mit Version $VERSION"
    exit 0
  fi
  sleep 1
done
fail "Health-Check nicht erreichbar (pm2 logs $PM2_NAME prüfen)"
