#!/usr/bin/env node
// Import jobs into the Huddle jobs board.
//
// Two sources:
//   1. A CSV you provide (CSV=path/to/jobs.csv) — columns: Job Title, Company,
//      Category, Tech Stack, Experience Level, Location, Salary Range, Job Type,
//      Company Website, Recruitment Email, Description, Created Date.
//   2. Live public job APIs (default when no CSV): Remotive, Arbeitnow, Jobicy,
//      filtered to the last DAYS days.
//
// Three ways to insert (first that is configured wins):
//   • MONGODB_URI  → insert straight into the database (no admin account needed)
//   • ADMIN_EMAIL + ADMIN_PASSWORD (+ BASE_URL) → insert via the admin API
//   • neither, or --dry-run → just write jobs-import.json to inspect
//
// Each job keeps its apply link (Company Website / posting URL), so "Apply" on
// the board opens the company's own site. Run this where there is internet
// and/or database access (not the CI sandbox, whose egress is locked down).
//
// Examples:
//   CSV=jobs.csv MONGODB_URI='mongodb+srv://…/huddle' npm run import-jobs -w @vca/server
//   CSV=jobs.csv BASE_URL=https://app ADMIN_EMAIL=a@b.c ADMIN_PASSWORD=pw npm run import-jobs -w @vca/server
//   DAYS=10 LIMIT=100 npm run import-jobs -w @vca/server -- --dry-run

import fs from 'node:fs';
import { buildImport, fromCsvRow, parseCsv } from '../src/jobsImport.js';

const env = process.env;
const BASE_URL = (env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DAYS = Number(env.DAYS || 10);
const LIMIT = Number(env.LIMIT || 100);
const DRY_RUN = process.argv.includes('--dry-run');
const argVal = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const CSV = env.CSV || argVal('--csv');

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
    const arr = pick(await getJson(url)) || [];
    console.log(`  ${name}: ${arr.length} jobs`);
    return arr;
  } catch (err) {
    console.warn(`  ${name}: failed (${err.message}) — skipping`);
    return [];
  }
}

/** Build the job list either from the CSV or from the public APIs. */
async function collect() {
  if (CSV) {
    const jobs = parseCsv(fs.readFileSync(CSV, 'utf8')).map(fromCsvRow).filter((j) => j.title && j.company);
    console.log(`Parsed ${jobs.length} jobs from ${CSV}.`);
    // A curated spreadsheet is inserted verbatim (roles may share a careers URL).
    return { jobs, dedupe: false };
  }
  console.log(`Fetching recent jobs (last ${DAYS} days, up to ${LIMIT})…`);
  const [remotive, arbeitnow, jobicy] = await Promise.all([
    fetchSource('Remotive', SOURCES.remotive, (d) => d.jobs),
    fetchSource('Arbeitnow', SOURCES.arbeitnow, (d) => d.data),
    fetchSource('Jobicy', SOURCES.jobicy, (d) => d.jobs),
  ]);
  const jobs = buildImport({ remotive, arbeitnow, jobicy }, { days: DAYS, limit: LIMIT });
  console.log(`Prepared ${jobs.length} unique jobs posted in the last ${DAYS} days.`);
  return { jobs, dedupe: true };
}

async function insertViaMongo(jobs) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  try {
    const db = env.MONGODB_DB ? client.db(env.MONGODB_DB) : client.db();
    const docs = jobs.map((j) => ({ ...j, createdAt: new Date() }));
    const res = await db.collection('jobs').insertMany(docs);
    console.log(`Done: inserted ${res.insertedCount} jobs into MongoDB (collection "jobs").`);
  } finally {
    await client.close();
  }
}

async function insertViaApi(jobs, dedupe) {
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
    body: JSON.stringify({ jobs, dedupe }),
  });
  console.log(`Done: imported ${result.created} jobs, skipped ${result.skipped}.`);
}

async function main() {
  const { jobs, dedupe } = await collect();
  if (!jobs.length) { console.log('Nothing to insert.'); return; }

  if (DRY_RUN) {
    fs.writeFileSync('jobs-import.json', JSON.stringify(jobs, null, 2));
    console.log(`Wrote jobs-import.json (${jobs.length} jobs).`);
    return;
  }
  if (env.MONGODB_URI) return insertViaMongo(jobs);
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) return insertViaApi(jobs, dedupe);

  fs.writeFileSync('jobs-import.json', JSON.stringify(jobs, null, 2));
  console.log(`Wrote jobs-import.json (${jobs.length} jobs).`);
  console.log('To insert, set MONGODB_URI, or ADMIN_EMAIL + ADMIN_PASSWORD (+ BASE_URL).');
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
