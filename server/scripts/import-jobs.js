#!/usr/bin/env node
// Import jobs into the Huddle jobs board.
//
// Two sources:
//   1. A CSV you provide (CSV=path/to/jobs.csv) — columns: Job Title, Company,
//      Category, Tech Stack, Experience Level, Location, Salary Range, Job Type,
//      Company Website, Recruitment Email, Description, Created Date.
//   2. Live public job APIs (default when no CSV): Remotive, Arbeitnow, Jobicy
//      and RemoteOK, filtered to the last DAYS days and (by default) tech roles.
//
// Get 500 real tech jobs from the last 15 days (dry run, writes jobs-import.json):
//   DAYS=15 LIMIT=500 npm run import-jobs -w @vca/server -- --dry-run
// Insert them straight into Mongo:
//   DAYS=15 LIMIT=500 MONGODB_URI='mongodb+srv://…/huddle' npm run import-jobs -w @vca/server
// Or via the admin API on the deployed server:
//   DAYS=15 LIMIT=500 BASE_URL=https://harish007.duckdns.org ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=pw npm run import-jobs -w @vca/server
// (TECH_ONLY=0 to include non-tech too.)
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
// Tech roles only by default (the Huddle board is tech-focused); TECH_ONLY=0 to include all.
const TECH_ONLY = env.TECH_ONLY !== '0';
const ARBEITNOW_PAGES = Math.max(1, Number(env.ARBEITNOW_PAGES || 4));
const DRY_RUN = process.argv.includes('--dry-run');
const argVal = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const CSV = env.CSV || argVal('--csv');

// Bigger pools so there is enough left after the recency + tech + dedupe filters.
const SOURCES = {
  remotive: 'https://remotive.com/api/remote-jobs?limit=1000',
  jobicy: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag=dev',
  remoteok: 'https://remoteok.com/api',
};
// Arbeitnow is paginated; pull several pages for volume.
const arbeitnowPages = Array.from({ length: ARBEITNOW_PAGES }, (_, i) => `https://www.arbeitnow.com/api/job-board-api?page=${i + 1}`);

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
  console.log(`Fetching recent ${TECH_ONLY ? 'tech ' : ''}jobs (last ${DAYS} days, up to ${LIMIT}) from Remotive, Arbeitnow, Jobicy, RemoteOK…`);
  const [remotive, jobicy, remoteok, ...arbeitnowPagesData] = await Promise.all([
    fetchSource('Remotive', SOURCES.remotive, (d) => d.jobs),
    fetchSource('Jobicy', SOURCES.jobicy, (d) => d.jobs),
    // RemoteOK's first array element is a legal/metadata object — keep only real postings.
    fetchSource('RemoteOK', SOURCES.remoteok, (d) => (Array.isArray(d) ? d.filter((x) => x && (x.id || x.slug) && x.position) : [])),
    ...arbeitnowPages.map((u, i) => fetchSource(`Arbeitnow p${i + 1}`, u, (d) => d.data)),
  ]);
  const arbeitnow = arbeitnowPagesData.flat();
  const jobs = buildImport({ remotive, arbeitnow, jobicy, remoteok }, { days: DAYS, limit: LIMIT, techOnly: TECH_ONLY });
  console.log(`Prepared ${jobs.length} unique ${TECH_ONLY ? 'tech ' : ''}jobs posted in the last ${DAYS} days.`);
  if (jobs.length < LIMIT) console.log(`Note: only ${jobs.length} matched — fewer than ${LIMIT} real postings fit the window (widen DAYS or lower LIMIT for more).`);
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
