// Pure job-import helpers: HTML stripping, classification, and the build pipeline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildImport, categorize, classifyExperience, classifyType, dedupeJobs, expFromRange, filterRecent, fromCsvRow, fromRemotive, parseCsv, parseSalaryRange, stripHtml } from '../src/jobsImport.js';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

test('stripHtml turns markup into readable text', () => {
  const out = stripHtml('<p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul>');
  assert.match(out, /Hello world/);
  assert.match(out, /• One/);
  assert.ok(!out.includes('<'));
});

test('categorize / classifyType / classifyExperience', () => {
  assert.equal(categorize('Senior React Developer', ['frontend']), 'tech');
  assert.equal(categorize('Marketing Manager', ['sales']), 'non-tech');
  assert.equal(classifyType('Part Time'), 'part-time');
  assert.equal(classifyType('Contract'), 'contract');
  assert.equal(classifyType('Full Time'), 'full-time');
  assert.equal(classifyExperience('Lead Engineer'), 'lead');
  assert.equal(classifyExperience('Senior Developer'), 'senior');
  assert.equal(classifyExperience('Junior Analyst'), 'entry');
  assert.equal(classifyExperience('Software Developer'), 'mid');
});

test('fromRemotive maps fields and sets the apply URL + source', () => {
  const j = fromRemotive({
    title: 'Senior Angular Developer',
    company_name: 'Acme',
    category: 'Software Development',
    tags: ['Angular', 'TypeScript'],
    job_type: 'full_time',
    publication_date: iso(2),
    candidate_required_location: 'India',
    description: '<p>Build things</p>',
    url: 'https://remotive.com/jobs/123',
  });
  assert.equal(j.title, 'Senior Angular Developer');
  assert.equal(j.company, 'Acme');
  assert.equal(j.category, 'tech');
  assert.equal(j.experience, 'senior');
  assert.equal(j.remote, true);
  assert.equal(j.applyUrl, 'https://remotive.com/jobs/123');
  assert.equal(j.source, 'Remotive');
  assert.deepEqual(j.skills, ['Angular', 'TypeScript']);
  assert.equal(j.description, 'Build things');
});

test('filterRecent drops old and undated jobs', () => {
  const jobs = [
    { title: 'A', company: 'C', applyUrl: 'u1', _date: iso(3) },
    { title: 'B', company: 'C', applyUrl: 'u2', _date: iso(40) },
    { title: 'D', company: 'C', applyUrl: 'u3', _date: null },
  ];
  const recent = filterRecent(jobs, 10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].title, 'A');
});

test('dedupeJobs removes duplicate apply URLs and title+company, newest first', () => {
  const jobs = [
    { title: 'A', company: 'C', applyUrl: 'https://x/1', _date: iso(5) },
    { title: 'A2', company: 'C', applyUrl: 'https://x/1', _date: iso(1) }, // dup URL
    { title: 'A', company: 'C', applyUrl: 'https://x/2', _date: iso(2) }, // dup title+company
    { title: 'B', company: 'C', applyUrl: 'https://x/3', _date: iso(1) },
  ];
  const out = dedupeJobs(jobs);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'B'); // newest first
});

test('parseCsv handles quoted fields with commas and newlines', () => {
  const csv = 'A,B,C\n1,"x, y","line1\nline2"\n2,plain,z\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].B, 'x, y');
  assert.equal(rows[0].C, 'line1\nline2');
  assert.equal(rows[1].A, '2');
});

test('parseSalaryRange reads Indian-format ranges', () => {
  assert.deepEqual(parseSalaryRange('₹35,00,000 - ₹55,00,000'), { min: 3500000, max: 5500000 });
  assert.deepEqual(parseSalaryRange('₹18,00,000+'), { min: 1800000, max: null });
  assert.deepEqual(parseSalaryRange(''), { min: null, max: null });
});

test('expFromRange uses the title then the year range', () => {
  assert.equal(expFromRange('7-12 Years', 'Angular Architect / Lead'), 'lead');
  assert.equal(expFromRange('2-5 Years', 'UI Developer - Angular / React'), 'mid');
  assert.equal(expFromRange('4-8 Years', 'Software Engineer'), 'senior');
});

test('fromCsvRow maps the real_it_jobs CSV shape with apply URL = careers site', () => {
  const row = {
    'Job Title': 'Senior Frontend Engineer (React/TypeScript)',
    Company: 'Postman',
    Category: 'Tech',
    'Tech Stack': 'React, Next.js, TypeScript, Node.js, Tailwind CSS',
    'Experience Level': '5-8 Years',
    Location: 'Bengaluru, Karnataka (Hybrid)',
    'Salary Range': '₹35,00,000 - ₹55,00,000',
    'Job Type': 'Full-time',
    'Company Website': 'https://www.postman.com/company/careers/',
    'Recruitment Email': 'careers@postman.com',
    Description: 'Join Postman.',
    'Created Date': '2026-11-10 23:00',
  };
  const j = fromCsvRow(row);
  assert.equal(j.company, 'Postman');
  assert.equal(j.category, 'tech');
  assert.equal(j.experience, 'senior');
  assert.equal(j.type, 'full-time');
  assert.equal(j.country, 'Bengaluru, Karnataka (Hybrid)');
  assert.equal(j.remote, false);
  assert.equal(j.salaryMin, 3500000);
  assert.equal(j.salaryMax, 5500000);
  assert.equal(j.salaryCurrency, 'INR');
  assert.equal(j.applyUrl, 'https://www.postman.com/company/careers/');
  assert.equal(j.source, 'Postman');
  assert.ok(j.skills.includes('React') && j.skills.includes('TypeScript'));
  assert.match(j.description, /Contact: careers@postman\.com/);
});

test('buildImport produces capped, finalized JobInput objects', () => {
  const remotive = Array.from({ length: 5 }, (_, i) => ({
    title: `Dev ${i}`,
    company_name: `Co ${i}`,
    tags: ['React'],
    job_type: 'full_time',
    publication_date: iso(1),
    description: `<p>Role ${i}</p>`,
    url: `https://remotive.com/jobs/${i}`,
  }));
  const jobs = buildImport({ remotive }, { days: 10, limit: 3 });
  assert.equal(jobs.length, 3);
  assert.ok(!('_date' in jobs[0]));
  assert.equal(jobs[0].source, 'Remotive');
  assert.ok(jobs[0].applyUrl.startsWith('https://'));
});
