# Shared local data services

Compose now runs one PG17/pgvector service with isolated `nova_hub`, `litellm`, and `langfuse` databases and login roles. One password protected Redis service uses Langfuse's existing DB 0, `noeviction`, and AOF persistence. Any future Redis client must choose its own database index or key prefix. ClickHouse and MinIO remain separate because they store different data.

## Migration record · 2026-10-20

- Stopped LiteLLM and Langfuse writers before taking snapshots.
- Verified custom-format dumps for all three PostgreSQL databases. Nova remained on its existing PG17/pgvector volume; LiteLLM and Langfuse dumps were restored into their own databases on that service.
- Ran `ops/postgres/init/10-app-databases.sh` manually on the already-initialized Nova volume; entrypoint init scripts run automatically only for a fresh PGDATA volume. The script creates/updates the two login roles and creates missing databases.
- Verified table counts after restore: Nova 6 public tables plus the Drizzle schema table and `vector`; LiteLLM 98 public tables; Langfuse 84 public tables. Verified the LiteLLM and Langfuse login roles connect to their respective databases.
- Saved and checksum-verified the Redis RDB, then restored it to a new shared volume. The snapshot contained 409 records; 78 had expired by archive inspection. After TTL expiry and Langfuse startup, the shared keyspace had 297 keys. AOF is enabled and reports a successful write.
- Kept Nova's existing PostgreSQL volume as the shared PG target. Retained the former LiteLLM/Langfuse PostgreSQL and Langfuse Redis source volumes; those remain declared but detached from active services.
- Confirmed LiteLLM's restored `LiteLLM_SpendLogs` table has 72 rows. Langfuse's unchanged ClickHouse volume contains 9,995 events across 6,414 trace IDs and 882 scores; its health endpoint returns HTTP 200.
- Protected migration archives remain outside the repository at `/private/tmp/nova-compose-migration-20261020/` until the services complete verification. Do not commit or upload them.
- Post-cutover checks passed: Nova `/api/health/ready` returned `ready`; LiteLLM `/health/readiness` returned HTTP 200; Langfuse `/api/public/health` returned HTTP 200; Redis reported `aof_enabled:1` and `aof_last_write_status:ok`.

## Cutover invariants

1. Stop writers before backups or restores; never let old and new service instances write concurrently.
2. Preserve a copy of the active Compose file and validated database/RDB backups before changing mounts or endpoints.
3. Restore each database into its own name with its existing login role. Verify ownership and app credentials before reconnecting writers.
4. Redis must load the RDB before enabling AOF on a new target volume. Enabling AOF against an empty directory first creates an empty AOF that takes precedence over `dump.rdb`.
5. Keep Langfuse on DB 0 to preserve its current keyspace; any additional client must use a separate database index or namespaced keys.
6. Keep source volumes until Nova migrations/readiness, LiteLLM readiness and spend lookup, Langfuse trace lookup, and Redis persistence/keyspace checks pass. Never run `docker compose down -v` during this migration.

Password rotation for the LiteLLM or Langfuse database role must update the corresponding value in `.env.local` and rerun the mounted role script against the initialized service with `pnpm exec varlock run -- docker compose exec -T postgres /docker-entrypoint-initdb.d/10-app-databases.sh`. The script uses SQL literal escaping and does not print either password.

## Run verification

Start application services with `pnpm exec varlock run -- docker compose --profile litellm up -d`. Check Nova readiness and migrations, LiteLLM `/health/readiness` and spend lookup, Langfuse login and a stored trace, Redis `INFO keyspace`/`INFO persistence`, and the dashboards. Confirm the source volumes remain present before retiring them. Keep the old volumes until the owner confirms the restored data is present.
