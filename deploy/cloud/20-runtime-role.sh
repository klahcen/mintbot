#!/bin/sh
set -eu
# Secret is hex-only; psql quotes it as a value and never echoes the statement.
runtime_password=$(cat /run/secrets/app-password)
case "$runtime_password" in *[!a-fA-F0-9]*|'') exit 1;; esac
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
\set runtime_password '$runtime_password'
CREATE ROLE mintbot LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'runtime_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE mintbot TO mintbot;
GRANT USAGE ON SCHEMA public TO mintbot;
GRANT SELECT, INSERT ON events TO mintbot;
SQL
unset runtime_password
