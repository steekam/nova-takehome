# Local test accounts

Run `pnpm db:migrate` then `env NODE_ENV=development pnpm db:seed` against a database on `localhost`, `127.0.0.1`, or `::1`.

Both accounts use `NovaLocal123!`:

- `teacher@example.test` (`teacher`)
- `curriculum-lead@example.test` (`curriculum_lead`)

The seed command requires `NODE_ENV=development` or `test` and refuses remote database hosts.
