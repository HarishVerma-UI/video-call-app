#!/usr/bin/env node
// Import ~100 real, recent jobs (with real "apply on their site" links) from
// free public job APIs into the Huddle jobs board.
//
// Needs internet + a running server with an admin account. Run it from your
// machine or server (NOT the CI sandbox, whose network is locked down):
//
//   BASE_URL=https://your-app.example \
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret \
//   DAYS=10 LIMIT=100 \
//   npm run import-jobs -w @vca/server
//
//   # Preview only — writes jobs-import.json and inserts nothing:
//   npm run import-jobs -w @vca/server -- --dry-run
//
// Sources (public, no key): Remotive, Arbeitnow, Jobicy. Each job's applyUrl is
// the original posting, so "Apply" on the board opens the company's own site.

import fs from 'node:fs';
import { buildImport } from '../src/jobsImport.js';

const env = process.env;
const BASE_URL = (env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DAYS = Number(env.DAYS || 10);
const LIMIT = Number(env.LIMIT || 100);
const DRY_RUN = process.argv.includes('--dry-run');

const SOURCES = {
  remotive: 'https://remotive.com/api/remote-jobs?limit=200',
  arbeitnow: 'https://www.arbeitnow.com/api/job-board-api',
  jobicy: 'https://jobicy.com/api/v2/remote-jobs?count=100',
};

async function getJson(url, opts) {
  const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', 'User-Agent': 'HuddleJobsImporter/1.0', ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function fetchSource(name, url, pick) {
  try {
    const data = await getJson(url);
    const arr = pick(data) || [];
    console.log(`  ${name}: ${arr.length} jobs`);
    return arr;
  } catch (err) {
    console.warn(`  ${name}: failed (${err.message}) — skipping`);
    return [];
  }
}

async function main() {
  console.log(`Fetching recent jobs (last ${DAYS} days, up to ${LIMIT})…`);
  const [remotive, arbeitnow, jobicy] = await Promise.all([
    fetchSource('Remotive', SOURCES.remotive, (d) => d.jobs),
    fetchSource('Arbeitnow', SOURCES.arbeitnow, (d) => d.data),
    fetchSource('Jobicy', SOURCES.jobicy, (d) => d.jobs),
  ]);

  const jobs = buildImport({ remotive, arbeitnow, jobicy }, { days: DAYS, limit: LIMIT });
  console.log(`Prepared ${jobs.length} unique jobs posted in the last ${DAYS} days.`);

  if (DRY_RUN || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    fs.writeFileSync('jobs-import.json', JSON.stringify(jobs, null, 2));
    console.log('Wrote jobs-import.json.');
    if (!DRY_RUN) console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD (and BASE_URL) to insert them.');
    return;
  }

  console.log(`Signing in to ${BASE_URL} as ${env.ADMIN_EMAIL}…`);
  const { token } = await getJson(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  });
  if (!token) throw new Error('Login did not return a token.');

  const result = await getJson(`${BASE_URL}/api/admin/jobs/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobs }),
  });
  console.log(`Done: imported ${result.created} jobs, skipped ${result.skipped} (duplicates/invalid).`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
