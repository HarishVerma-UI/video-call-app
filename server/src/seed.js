#!/usr/bin/env node
// Seed script: creates 30 dummy users with profiles, photos, and 30 posts.
// Run once against a running MongoDB:
//   node server/src/seed.js
// Or inside Docker:
//   docker compose exec app node server/src/seed.js
//
// Photos are fetched from https://i.pravatar.cc (free, no API key needed).
// Post images use https://picsum.photos (free, no API key needed).

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env so MONGODB_URI is available ──
function loadDotEnv(file) {
  let text;
  try { text = fsSync.readFileSync(file, 'utf8'); } catch { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv(path.resolve(here, '../.env'));
// Also try deploy/.env for docker-compose setups
loadDotEnv(path.resolve(here, '../../deploy/.env'));

// ── Config ──
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'huddle';
const UPLOAD_DIR = process.env.LOCAL_MEDIA_DIR || path.resolve(here, '../uploads');

// ── Dummy data ──
const PEOPLE = [
  { name: 'Aarav Sharma', headline: 'Full-Stack Developer at TechCorp', location: 'Bengaluru, India', skills: ['React', 'Node.js', 'TypeScript', 'MongoDB'], bio: 'Passionate about building scalable web applications. 5+ years of experience in full-stack development.' },
  { name: 'Priya Patel', headline: 'UX Designer & Researcher', location: 'Mumbai, India', skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems'], bio: 'Creating human-centered digital experiences that delight users.' },
  { name: 'Marcus Chen', headline: 'Senior DevOps Engineer', location: 'San Francisco, USA', skills: ['AWS', 'Kubernetes', 'Terraform', 'Docker'], bio: 'Infrastructure as code enthusiast. Building reliable cloud platforms.' },
  { name: 'Sarah Johnson', headline: 'Product Manager at StartupXYZ', location: 'New York, USA', skills: ['Product Strategy', 'Agile', 'Data Analysis', 'User Stories'], bio: 'Turning user needs into impactful products. Previously at Google and Meta.' },
  { name: 'Kenji Tanaka', headline: 'Machine Learning Engineer', location: 'Tokyo, Japan', skills: ['Python', 'TensorFlow', 'PyTorch', 'NLP'], bio: 'Working on cutting-edge NLP models. Published researcher in computational linguistics.' },
  { name: 'Emma Wilson', headline: 'Frontend Architect', location: 'London, UK', skills: ['React', 'Vue.js', 'Web Components', 'Performance'], bio: 'Obsessed with web performance and accessible interfaces.' },
  { name: 'Raj Malhotra', headline: 'Cloud Solutions Architect', location: 'Hyderabad, India', skills: ['Azure', 'Microservices', 'System Design', 'Java'], bio: 'Designing enterprise cloud architectures for Fortune 500 companies.' },
  { name: 'Liu Wei', headline: 'Backend Engineer at ByteScale', location: 'Shanghai, China', skills: ['Go', 'gRPC', 'PostgreSQL', 'Redis'], bio: 'Building high-throughput distributed systems. Performance-first mindset.' },
  { name: 'Ana García', headline: 'Data Scientist', location: 'Madrid, Spain', skills: ['Python', 'R', 'SQL', 'Tableau'], bio: 'Extracting insights from complex datasets. Specializing in recommendation systems.' },
  { name: 'David Kim', headline: 'iOS Developer', location: 'Seoul, South Korea', skills: ['Swift', 'SwiftUI', 'Core Data', 'ARKit'], bio: 'Crafting beautiful and performant iOS applications. App Store featured developer.' },
  { name: 'Fatima Al-Hassan', headline: 'Cybersecurity Analyst', location: 'Dubai, UAE', skills: ['Penetration Testing', 'SIEM', 'Threat Modeling', 'SOC'], bio: 'Protecting organizations from cyber threats. Certified ethical hacker.' },
  { name: 'James O\'Brien', headline: 'Tech Lead at FinanceApp', location: 'Dublin, Ireland', skills: ['C#', '.NET', 'SQL Server', 'Azure'], bio: 'Leading engineering teams building secure financial platforms.' },
  { name: 'Yuki Nakamura', headline: 'Game Developer', location: 'Osaka, Japan', skills: ['Unity', 'C#', 'Unreal Engine', 'Shader Programming'], bio: 'Independent game developer. Released 3 titles on Steam. Mentor for aspiring devs.' },
  { name: 'Maria Santos', headline: 'QA Engineering Manager', location: 'São Paulo, Brazil', skills: ['Selenium', 'Cypress', 'Test Strategy', 'CI/CD'], bio: 'Building quality-first engineering cultures. Advocate for test automation.' },
  { name: 'Alex Thompson', headline: 'Blockchain Developer', location: 'Austin, USA', skills: ['Solidity', 'Ethereum', 'Web3.js', 'Smart Contracts'], bio: 'Building decentralized applications. Contributing to open-source DeFi protocols.' },
  { name: 'Neha Gupta', headline: 'Engineering Manager at CloudFirst', location: 'Pune, India', skills: ['Leadership', 'System Design', 'Python', 'AWS'], bio: 'Growing high-performing engineering teams. Speaker at tech conferences.' },
  { name: 'Oliver Schmidt', headline: 'Embedded Systems Engineer', location: 'Berlin, Germany', skills: ['C', 'RTOS', 'ARM', 'IoT'], bio: 'Building firmware for connected devices. Passionate about IoT and edge computing.' },
  { name: 'Sofia Rossi', headline: 'Technical Writer', location: 'Milan, Italy', skills: ['Documentation', 'API Docs', 'Markdown', 'Developer Experience'], bio: 'Making complex technology accessible through clear documentation.' },
  { name: 'Ahmed Hassan', headline: 'SRE at ScaleOps', location: 'Cairo, Egypt', skills: ['Linux', 'Prometheus', 'Grafana', 'Incident Response'], bio: 'Keeping systems reliable at scale. On-call warrior and automation advocate.' },
  { name: 'Nina Petrov', headline: 'AI Research Scientist', location: 'Moscow, Russia', skills: ['Deep Learning', 'Computer Vision', 'Research', 'Python'], bio: 'Researching novel architectures for image understanding. Published 12 papers.' },
  { name: 'Carlos Mendez', headline: 'Mobile Developer', location: 'Mexico City, Mexico', skills: ['React Native', 'Flutter', 'Firebase', 'GraphQL'], bio: 'Cross-platform mobile development expert. Building apps used by millions.' },
  { name: 'Aisha Okonkwo', headline: 'Platform Engineer', location: 'Lagos, Nigeria', skills: ['Kubernetes', 'GitOps', 'Service Mesh', 'Go'], bio: 'Building internal developer platforms. Making infrastructure self-service.' },
  { name: 'Tom Anderson', headline: 'Security Engineer at SecureNet', location: 'Sydney, Australia', skills: ['AppSec', 'OWASP', 'Code Review', 'Rust'], bio: 'Securing applications at every layer. Building security tools in Rust.' },
  { name: 'Mei Lin', headline: 'Database Administrator', location: 'Taipei, Taiwan', skills: ['PostgreSQL', 'MySQL', 'MongoDB', 'Query Optimization'], bio: 'Keeping databases fast and reliable. Expert in query optimization and sharding.' },
  { name: 'Daniel Kowalski', headline: 'Scrum Master & Agile Coach', location: 'Warsaw, Poland', skills: ['Scrum', 'Kanban', 'SAFe', 'Team Coaching'], bio: 'Helping teams deliver better software faster through agile practices.' },
  { name: 'Isabella Martinez', headline: 'VR/AR Developer', location: 'Barcelona, Spain', skills: ['Unity', 'WebXR', 'Three.js', 'Blender'], bio: 'Creating immersive experiences for education and entertainment.' },
  { name: 'Ryan Murphy', headline: 'API Platform Lead', location: 'Toronto, Canada', skills: ['REST', 'GraphQL', 'API Gateway', 'OpenAPI'], bio: 'Designing APIs that developers love. Building platform teams.' },
  { name: 'Zara Khan', headline: 'Data Engineer', location: 'Karachi, Pakistan', skills: ['Spark', 'Airflow', 'dbt', 'Snowflake'], bio: 'Building robust data pipelines. Turning raw data into business value.' },
  { name: 'Lucas Dubois', headline: 'Open Source Maintainer', location: 'Paris, France', skills: ['Rust', 'C++', 'Open Source', 'Community'], bio: 'Maintaining popular open-source libraries. Believer in public goods.' },
  { name: 'Haruki Sato', headline: 'Site Reliability Engineer', location: 'Nagoya, Japan', skills: ['GCP', 'Terraform', 'Python', 'Monitoring'], bio: 'Building reliable infrastructure at scale. Error budgets and SLOs evangelist.' },
];

const POSTS = [
  'Just shipped a major feature after 3 weeks of intense coding. The feeling of seeing it live in production is unmatched! 🚀',
  'Hot take: TypeScript is not just "JavaScript with types." It fundamentally changes how you think about architecture and API design.',
  'Spent the weekend mentoring at a local coding bootcamp. The energy from new developers is incredible and reminds me why I got into tech.',
  'Finally migrated our monolith to microservices. Took 8 months but the deployment velocity improvement is already showing results.',
  'Unpopular opinion: Most companies don\'t need Kubernetes. A well-configured VM with Docker Compose handles 90% of use cases.',
  'Reading "Designing Data-Intensive Applications" for the third time. Each read reveals something new. Absolute must-read for backend engineers.',
  'Our team just hit 99.99% uptime for the quarter. Huge shout out to everyone who contributed to our reliability efforts! 📊',
  'Attended an amazing conference talk on WebAssembly. The future of web performance looks incredibly promising.',
  'Pro tip: Write your tests before your code, not after. The design feedback you get from TDD is invaluable.',
  'Just open-sourced a library I\'ve been working on for months. Nervous but excited to see what the community thinks!',
  'Had a great 1:1 with my manager today about career growth. Remember: your career is YOUR responsibility. Be proactive about it.',
  'Debugging a race condition in production at 2 AM. Found it: a missing mutex on a shared cache. Always protect your shared state! 🔒',
  'Started learning Rust this month. The borrow checker is brutal but the safety guarantees are worth every compile error.',
  'Our team adopted pair programming and our code review cycle dropped from 2 days to 4 hours. Communication > process.',
  'Reflecting on 10 years in tech. The biggest lesson: the best code is the code you don\'t write. Simplicity always wins.',
  'Just gave my first conference talk! Terrifying but incredibly rewarding. If you\'re thinking about speaking, just do it.',
  'The gap between a junior and senior developer isn\'t technical skill — it\'s knowing when NOT to use a shiny new technology.',
  'Spent today refactoring legacy code from 2018. No tests, no docs, variable names like "x" and "tmp2". We\'ve all been there. 😅',
  'Excited to announce I\'m joining a new company next month! Sometimes you need a change to grow. New adventures ahead!',
  'Built a side project this weekend: a CLI tool that generates git commit messages using AI. Already saving me 5 minutes daily.',
  'The best architecture decisions I\'ve made were the ones where I said "let\'s keep it simple" instead of over-engineering.',
  'Completed my AWS Solutions Architect certification! 3 months of study but worth every hour invested.',
  'Mentoring a junior developer who just landed their first PR in our main repo. Watching someone grow is the best part of being senior.',
  'Docker tip: Use multi-stage builds. Our image went from 1.2GB to 180MB. Your CI pipeline will thank you. 📦',
  'Just discovered that our database had been running without indexes on a critical query. Added them and response time dropped from 3s to 12ms.',
  'Working remotely from Bali this month. The digital nomad life isn\'t for everyone, but the change of scenery boosts my creativity.',
  'Code review culture matters. We went from "LGTM" rubber stamps to meaningful reviews, and our bug rate dropped 40%.',
  'Spent the morning writing documentation. I know it\'s not glamorous, but future-you will be grateful. Document everything!',
  'Our startup just closed Series A! Incredible journey from a side project to a funded company. Never stop building. 🎉',
  'Learned something humbling today: a bug I spent 6 hours debugging was a typo. Always check the simple things first.',
];

// ── Helpers ──
async function downloadImage(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return buffer.length;
}

// ── Main ──
async function main() {
  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);

  const usersCol = db.collection('users');
  const profilesCol = db.collection('profiles');
  const postsCol = db.collection('posts');

  // Check if seed data already exists
  const existingSeed = await usersCol.countDocuments({ email: /^seed\d+@huddle\.demo$/ });
  if (existingSeed >= 30) {
    console.log('Seed data already exists (found %d seed users). Skipping.', existingSeed);
    await client.close();
    return;
  }

  console.log('🌱 Seeding Huddle with 30 users, profiles, and posts...\n');

  // Ensure upload directory exists
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const userIds = [];

  // ── Create 30 users + profiles + photos ──
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const email = `seed${i + 1}@huddle.demo`;
    const now = new Date();

    // Check if user exists
    const existing = await usersCol.findOne({ email });
    if (existing) {
      userIds.push(existing._id.toString());
      console.log(`  ✓ User ${i + 1}/30 ${p.name} already exists`);
      continue;
    }

    // Create user
    const userDoc = {
      name: p.name,
      email,
      passwordHash: null,
      role: 'user',
      provider: null,
      providerId: null,
      tokenVersion: 0,
      createdAt: new Date(now.getTime() - (30 - i) * 86400000), // stagger creation dates
      updatedAt: now,
      lastLoginAt: new Date(now.getTime() - i * 3600000),
    };
    const userRes = await usersCol.insertOne(userDoc);
    const userId = userRes.insertedId.toString();
    userIds.push(userId);

    // Download avatar photo
    let photoKey = null;
    try {
      const avatarId = 100 + i; // deterministic avatar IDs
      const avatarUrl = `https://i.pravatar.cc/300?img=${avatarId}`;
      photoKey = `photo/${userId}/${Date.now()}-${randomBytes(6).toString('hex')}.jpg`;
      const destPath = path.join(UPLOAD_DIR, photoKey);
      const bytes = await downloadImage(avatarUrl, destPath);
      console.log(`  📷 Photo for ${p.name}: ${bytes} bytes`);
    } catch (err) {
      console.log(`  ⚠ Could not download photo for ${p.name}: ${err.message}`);
      photoKey = null;
    }

    // Create profile
    const profileDoc = {
      _id: userId,
      name: p.name,
      headline: p.headline,
      bio: p.bio,
      location: p.location,
      mobile: '',
      photoKey,
      cvKey: null,
      cvName: '',
      skills: p.skills,
      experience: [
        { title: p.headline.split(' at ')[0] || 'Software Engineer', company: p.headline.split(' at ')[1] || 'Tech Company', start: '2021', end: 'Present', description: p.bio },
      ],
      education: [
        { school: 'University of Technology', degree: 'B.S. Computer Science', year: '2018' },
      ],
      mentor: i % 3 === 0,
      mentee: i % 4 === 0,
      focusAreas: p.skills.slice(0, 2),
      createdAt: userDoc.createdAt,
      updatedAt: now,
    };
    await profilesCol.updateOne({ _id: userId }, { $set: profileDoc }, { upsert: true });
    console.log(`  ✓ User ${i + 1}/30 ${p.name} created`);

    // Small delay to avoid rate-limiting on avatar service
    if (photoKey) await new Promise((r) => setTimeout(r, 300));
  }

  // ── Create 30 posts ──
  console.log('\n📝 Creating 30 posts...\n');

  const existingPosts = await postsCol.countDocuments({ authorId: { $in: userIds } });
  if (existingPosts >= 30) {
    console.log('  Posts already seeded (%d found). Skipping.', existingPosts);
  } else {
    for (let i = 0; i < POSTS.length; i++) {
      const authorIdx = i % PEOPLE.length;
      const authorId = userIds[authorIdx];
      const author = PEOPLE[authorIdx];
      const authorProfile = await profilesCol.findOne({ _id: authorId });

      // Download a post image for every 3rd post
      let imageKey = null;
      if (i % 3 === 0) {
        try {
          const imgId = 200 + i;
          const imgUrl = `https://picsum.photos/id/${imgId}/800/600`;
          imageKey = `post/${authorId}/${Date.now()}-${randomBytes(6).toString('hex')}.jpg`;
          const destPath = path.join(UPLOAD_DIR, imageKey);
          const bytes = await downloadImage(imgUrl, destPath);
          console.log(`  🖼 Post image ${i + 1}: ${bytes} bytes`);
        } catch (err) {
          console.log(`  ⚠ Could not download post image ${i + 1}: ${err.message}`);
          imageKey = null;
        }
      }

      const postDoc = {
        authorId,
        authorName: author.name,
        authorPhotoKey: authorProfile?.photoKey ?? null,
        text: POSTS[i],
        imageKey,
        likes: userIds.filter((_, j) => (j + i) % 5 === 0), // some random likes
        comments: i % 4 === 0
          ? [
              {
                id: randomBytes(12).toString('hex'),
                userId: userIds[(authorIdx + 1) % userIds.length],
                name: PEOPLE[(authorIdx + 1) % PEOPLE.length].name,
                text: 'Great insight! Thanks for sharing.',
                ts: Date.now() - (30 - i) * 3600000,
              },
              {
                id: randomBytes(12).toString('hex'),
                userId: userIds[(authorIdx + 2) % userIds.length],
                name: PEOPLE[(authorIdx + 2) % PEOPLE.length].name,
                text: 'Totally agree with this. Well said! 👏',
                ts: Date.now() - (30 - i) * 1800000,
              },
            ]
          : [],
        createdAt: new Date(Date.now() - (30 - i) * 3600000 * 2), // stagger post times
      };
      await postsCol.insertOne(postDoc);
      console.log(`  ✓ Post ${i + 1}/30 by ${author.name}`);

      if (imageKey) await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('\n✅ Seed complete! 30 users, 30 profiles, 30 posts created.');
  console.log('   Seed accounts use emails: seed1@huddle.demo … seed30@huddle.demo');
  console.log('   These accounts have no password (display-only).\n');

  await client.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
