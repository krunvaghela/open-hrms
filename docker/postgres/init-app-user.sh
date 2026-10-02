#!/bin/sh
set -eu

# The API has a separate role without database-superuser privileges.
# The official image runs this only when initializing an empty data volume.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DB_PASSWORD
CREATE ROLE open_hrms_app LOGIN PASSWORD :'app_password';
GRANT USAGE, CREATE ON SCHEMA public TO open_hrms_app;
SQL
