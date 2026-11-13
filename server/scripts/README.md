# Scripts

## import-jobs.js — seed the jobs board with real, recent jobs

Pulls real jobs posted in the last N days from free public job APIs
(**Remotive**, **Arbeitnow**, **Jobicy** — no API key needed), normalizes them to
the Huddle job shape, de-duplicates, and inserts up to `LIMIT` of them via the
admin API. Each job keeps its **original apply link**, so **Apply** on the board
opens the company's own site.

> Run this from a machine or server **with internet access** and an **admin
> account** on the target app. It will not work from a locked-down CI sandbox.

### Preview (no insert)

```bash
npm run import-jobs -w @vca/server -- --dry-run
# writes jobs-import.json so you can inspect what would be imported
```

### Insert into a running app

```bash
BASE_URL=https://your-app.example \
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD='your-password' \
DAYS=10 LIMIT=100 \
npm run import-jobs -w @vca/server
```

Output: `Done: imported 100 jobs, skipped 12 (duplicates/invalid).`

Re-running is safe — duplicates (same apply URL, or same title + company) are
skipped both in the script and on the server.

### Options (environment variables)

| Var              | Default                 | Meaning                                   |
| ---------------- | ----------------------- | ----------------------------------------- |
| `BASE_URL`       | `http://localhost:3001` | The running app to insert into            |
| `ADMIN_EMAIL`    | —                       | Admin account email (required to insert)  |
| `ADMIN_PASSWORD` | —                       | Admin account password                    |
| `DAYS`           | `10`                    | Only import jobs posted within this window |
| `LIMIT`          | `100`                   | Max jobs to insert                        |

Without `ADMIN_EMAIL`/`ADMIN_PASSWORD` (or with `--dry-run`) it just writes
`jobs-import.json`.

### Notes

- These sources are **remote-first** job boards, so most imported jobs are
  tagged Remote. Add more sources by extending `SOURCES` in `import-jobs.js`
  and adding a normalizer in `../src/jobsImport.js`.
- Respect each API's terms of use and rate limits.
