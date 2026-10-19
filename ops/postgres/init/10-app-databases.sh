#!/bin/bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=litellm_password="$LITELLM_POSTGRES_PASSWORD" \
  --set=langfuse_password="$LANGFUSE_POSTGRES_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE litellm LOGIN PASSWORD %L', :'litellm_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'litellm')
\gexec
SELECT format('ALTER ROLE litellm PASSWORD %L', :'litellm_password')
\gexec
SELECT 'CREATE DATABASE litellm OWNER litellm'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'litellm')
\gexec

SELECT format('CREATE ROLE langfuse LOGIN PASSWORD %L', :'langfuse_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'langfuse')
\gexec
SELECT format('ALTER ROLE langfuse PASSWORD %L', :'langfuse_password')
\gexec
SELECT 'CREATE DATABASE langfuse OWNER langfuse'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')
\gexec
SQL
