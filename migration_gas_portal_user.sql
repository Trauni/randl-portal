-- #232: Eigene Rolle fuer das Portal in gas-db (Postgres, Datenbank gaswebshop).
-- Ausfuehren als gasadmin, Passwort vorher setzen (nicht ins Repo!):
--   docker exec -i gas-db psql -U gasadmin -d gaswebshop -v pw="'NEUES_PASSWORT'" -f - < migration_gas_portal_user.sql
-- Danach in der Portal-.env: GAS_DB_USER=randl_portal, GAS_DB_PASS=<Passwort>, pm2 restart.
--
-- Das Portal greift direkt nur auf diese Tabellen zu (alles andere laeuft ueber gas-admin-backend):
--   customers                     SELECT, INSERT (Neukunde), UPDATE (lexware_id, ser_raw_data, SER-Flags)
--   customer_delivery_addresses   SELECT (SER-Push)

CREATE ROLE randl_portal LOGIN PASSWORD :pw;
GRANT CONNECT ON DATABASE gaswebshop TO randl_portal;
GRANT USAGE ON SCHEMA public TO randl_portal;
GRANT SELECT, INSERT, UPDATE ON customers TO randl_portal;
GRANT SELECT ON customer_delivery_addresses TO randl_portal;
-- falls customers.id ueber eine Sequenz vergeben wird
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO randl_portal;
