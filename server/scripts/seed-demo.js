// Seed realistic demo data: people with profiles, connections, posts (with likes
// and comments) and direct messages, so the social pages look lived-in.
//
//   MONGODB_URI=mongodb://localhost:27017 node scripts/seed-demo.js [your@email]
//
// Demo accounts use @huddle.demo emails and the password "Demo@1234". Re-running
// wipes the previous demo data first, so it's safe to run repeatedly. If an email
// is given, that real account gets connected to most demo people, so its feed,
// network and messages fill up too. Real users' own posts and profiles are untouched.

import { MongoClient } from 'mongodb';
import { hashPassword } from '../src/auth/password.js';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB ?? 'huddle';
const meEmail = process.argv[2]?.toLowerCase();
const DOMAIN = '@huddle.demo';

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
const pairKey = (a, b) => [String(a), String(b)].sort().join(':');
const rid = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');

const PEOPLE = [
  { key: 'priya', name: 'Priya Sharma', headline: 'Senior Frontend Engineer at Flipkart', location: 'Bengaluru, India', skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility'], mentor: true, focusAreas: ['Frontend architecture', 'Career growth'], bio: 'Building fast, accessible UIs for 400M+ shoppers. I mentor early-career engineers on frontend craft.', experience: [{ title: 'Senior Frontend Engineer', company: 'Flipkart', start: '2021', end: 'Present', description: 'Lead for the checkout design system; cut bundle size by 38%.' }, { title: 'Frontend Engineer', company: 'Swiggy', start: '2018', end: '2021', description: 'Built the restaurant partner dashboard in React.' }], education: [{ school: 'IIIT Hyderabad', degree: 'B.Tech, Computer Science', year: '2018' }] },
  { key: 'arjun', name: 'Arjun Mehta', headline: 'Engineering Manager · Razorpay', location: 'Bengaluru, India', skills: ['Leadership', 'Node.js', 'Payments', 'System Design'], mentor: true, focusAreas: ['Engineering management', 'System design'], bio: 'Managing the payments gateway team. Happy to talk about moving from IC to EM.', experience: [{ title: 'Engineering Manager', company: 'Razorpay', start: '2020', end: 'Present', description: 'Leading a team of 12 across gateway and reconciliation.' }, { title: 'Senior Software Engineer', company: 'Paytm', start: '2015', end: '2020', description: 'Wallet and UPI backend services.' }], education: [{ school: 'BITS Pilani', degree: 'B.E., Electronics', year: '2015' }] },
  { key: 'sneha', name: 'Sneha Iyer', headline: 'Product Designer · Freshworks', location: 'Chennai, India', skills: ['Figma', 'UX Research', 'Prototyping', 'Design Systems'], mentor: false, mentee: true, focusAreas: ['Design leadership'], bio: 'Designing CRM workflows that people actually enjoy. Sketching on weekends.', experience: [{ title: 'Product Designer', company: 'Freshworks', start: '2022', end: 'Present', description: 'Owns the Freshsales pipeline and deal views.' }], education: [{ school: 'NID Ahmedabad', degree: 'M.Des, Interaction Design', year: '2022' }] },
  { key: 'rahul', name: 'Rahul Nair', headline: 'Angular Tech Lead at Infosys', location: 'Pune, India', skills: ['Angular', 'RxJS', 'NgRx', 'Storybook'], mentor: true, focusAreas: ['Angular migrations', 'Component libraries'], bio: 'Took three enterprise apps from AngularJS to Angular 17. Ask me about migrations.', experience: [{ title: 'Technical Lead', company: 'Infosys', start: '2019', end: 'Present', description: 'Leading UI for a banking client; shared component library used by 9 teams.' }, { title: 'Senior UI Developer', company: 'TCS', start: '2014', end: '2019', description: 'AngularJS to Angular migration for an insurance portal.' }], education: [{ school: 'College of Engineering Pune', degree: 'B.Tech, IT', year: '2014' }] },
  { key: 'ananya', name: 'Ananya Gupta', headline: 'Data Scientist · Zomato', location: 'Gurugram, India', skills: ['Python', 'Machine Learning', 'SQL', 'Experimentation'], mentee: true, focusAreas: ['ML in production'], bio: 'Recommendations and delivery-time prediction. Coffee and cricket.', experience: [{ title: 'Data Scientist', company: 'Zomato', start: '2021', end: 'Present', description: 'Delivery ETA models; reduced error by 22%.' }], education: [{ school: 'IIT Delhi', degree: 'M.Tech, Data Science', year: '2021' }] },
  { key: 'vikram', name: 'Vikram Reddy', headline: 'DevOps Engineer · AWS Certified', location: 'Hyderabad, India', skills: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD'], mentor: true, focusAreas: ['Cloud infrastructure'], bio: 'Infra as code everything. Running on-call so you can sleep.', experience: [{ title: 'Senior DevOps Engineer', company: 'Microsoft IDC', start: '2020', end: 'Present', description: 'Platform tooling for Azure DevOps pipelines.' }, { title: 'DevOps Engineer', company: 'ThoughtWorks', start: '2017', end: '2020', description: 'Kubernetes migrations for retail clients.' }], education: [{ school: 'JNTU Hyderabad', degree: 'B.Tech, CSE', year: '2017' }] },
  { key: 'meera', name: 'Meera Krishnan', headline: 'QA Automation Lead · Zoho', location: 'Chennai, India', skills: ['Playwright', 'Cypress', 'Test Strategy', 'Java'], mentor: true, focusAreas: ['Test automation'], bio: 'Making flaky tests a thing of the past.', experience: [{ title: 'QA Automation Lead', company: 'Zoho', start: '2018', end: 'Present', description: 'Built the end-to-end suite for Zoho Desk.' }], education: [{ school: 'Anna University', degree: 'B.E., CSE', year: '2013' }] },
  { key: 'karan', name: 'Karan Malhotra', headline: 'Full Stack Developer · Open to work', location: 'Delhi, India', skills: ['React', 'Node.js', 'MongoDB', 'Next.js'], mentee: true, focusAreas: ['Interview prep', 'System design'], bio: 'Two years building SaaS products. Looking for my next full stack role.', experience: [{ title: 'Full Stack Developer', company: 'Instamojo', start: '2023', end: '2025', description: 'Storefront builder and merchant onboarding.' }], education: [{ school: 'Delhi Technological University', degree: 'B.Tech, Software Engineering', year: '2023' }] },
  { key: 'divya', name: 'Divya Pillai', headline: 'Technical Recruiter · Atlassian', location: 'Bengaluru, India', skills: ['Tech Hiring', 'Employer Branding', 'Sourcing'], focusAreas: ['Hiring'], bio: 'Hiring frontend and platform engineers for Atlassian Bengaluru. DMs open.', experience: [{ title: 'Technical Recruiter', company: 'Atlassian', start: '2022', end: 'Present', description: 'Engineering hiring across Jira and Confluence.' }], education: [{ school: 'Christ University', degree: 'MBA, HR', year: '2019' }] },
  { key: 'sameer', name: 'Sameer Khan', headline: 'Mobile Engineer · React Native & Swift', location: 'Mumbai, India', skills: ['React Native', 'Swift', 'Kotlin', 'Performance'], focusAreas: ['Mobile'], bio: 'Shipping apps used by millions at CRED.', experience: [{ title: 'Mobile Engineer', company: 'CRED', start: '2021', end: 'Present', description: 'Rewards and payments flows in React Native.' }], education: [{ school: 'VJTI Mumbai', degree: 'B.Tech, Computer Engineering', year: '2020' }] },
];

// [author, hoursAgo, text, likers, comments: [commenter, text]]
const POSTS = [
  ['rahul', 3, 'Finally wrapped up our Angular 15 → 18 migration. Standalone components + the new control flow syntax cut our template boilerplate by ~30%. Biggest lesson: migrate shared libraries first, apps second.', ['priya', 'karan', 'meera', 'me'], [['priya', 'Libraries first is such underrated advice. Did you use the schematics or hand-migrate?'], ['rahul', '@Priya mostly schematics, then a week of cleanup for custom ControlValueAccessors.']]],
  ['divya', 6, "We're hiring Senior Frontend Engineers in Bengaluru 🚀 React/TypeScript, design systems experience a big plus. Hybrid, 3 days in office. Drop me a DM if you're interested or know someone great!", ['arjun', 'sneha', 'karan'], [['karan', 'Sent you a DM!']]],
  ['priya', 20, 'Hot take: most "slow React app" problems are actually "too much JavaScript" problems. Before reaching for memo/useCallback everywhere, open the bundle analyzer. We found a 400KB date library imported for one format() call.', ['rahul', 'sameer', 'ananya', 'arjun', 'me'], [['sameer', 'Same story on mobile. Hermes profiling showed a moment.js import from a forgotten utils file 😅'], ['arjun', 'Bundle budgets in CI saved us from this regression twice.']]],
  ['vikram', 28, 'PSA: if your EC2 instance is quietly running out of disk, check /var/lib/docker. `docker system prune -a` reclaimed 38GB on one of our build boxes today.', ['me', 'meera'], [['meera', 'Bookmarking this. Our runners hit this every month.']]],
  ['sneha', 46, 'Ran 8 usability sessions this week on our new onboarding. Every single participant missed the "Skip" link. Lesson re-learned: if it matters, it is a button, not a link.', ['priya', 'divya', 'ananya'], []],
  ['arjun', 70, "Two years into managing, here's what I wish I'd known: your calendar is your strategy. If 1:1s and design reviews keep getting bumped, that's the real priority list talking.", ['rahul', 'vikram', 'priya', 'sneha', 'me'], [['rahul', 'Needed to hear this today.'], ['vikram', 'Stealing "your calendar is your strategy".']]],
  ['ananya', 96, 'Our delivery-time model is now live in 40 cities 🎉 Big thanks to the platform team for making feature-store lookups under 5ms possible.', ['arjun', 'karan', 'vikram'], [['arjun', 'Congrats Ananya, huge milestone!']]],
  ['meera', 120, 'Moved our E2E suite from Selenium to Playwright. Run time down from 42 min to 11 min, flake rate from 6% to under 1%. Auto-waiting alone was worth it.', ['rahul', 'karan', 'vikram'], [['karan', 'Did you keep any Selenium tests around for legacy browsers?'], ['meera', 'Nope, Playwright WebKit covered what we needed.']]],
  ['karan', 150, "Day 30 of job hunting. 4 final rounds, 2 offers pending. To anyone in the same boat: keep shipping side projects, they've come up in every interview.", ['priya', 'divya', 'sneha', 'arjun', 'meera', 'me'], [['divya', "You've got this, Karan!"], ['priya', 'Happy to do a mock system design round if useful.']]],
  ['sameer', 200, 'Shipped our first screen built fully with the React Native New Architecture. Fabric renderer made our long lists noticeably smoother on low-end Android.', ['priya', 'ananya'], []],
];

// [other, [[fromMe, text, hoursAgo]]]
const DMS = [
  ['divya', [[false, "Hi! Saw your profile, you'd be a great fit for our Senior Frontend role. Open to a quick chat?", 30], [true, 'Hi Divya, thanks for reaching out! Yes, happy to chat. Does Thursday work?', 29], [false, 'Thursday 4pm works. Sending an invite now 🙂', 28]]],
  ['rahul', [[true, 'Rahul, loved your migration post. How did you handle NgRx during the upgrade?', 2], [false, 'Upgraded NgRx in lockstep with Angular, one major at a time. Happy to jump on a Huddle and show you our checklist.', 1]]],
  ['priya', [[false, 'Are you joining the frontend meetup on Saturday?', 50], [true, "Planning to! Are you speaking?", 49], [false, 'Yes, a short talk on design tokens. See you there!', 48]]],
];

const CONNECTED = ['priya', 'arjun', 'rahul', 'sneha', 'vikram', 'divya', 'meera', 'ananya'];
const INCOMING = ['karan', 'sameer']; // pending requests to "me"
const AMONG = [['priya', 'rahul'], ['priya', 'sameer'], ['arjun', 'vikram'], ['arjun', 'ananya'], ['sneha', 'divya'], ['rahul', 'meera'], ['karan', 'priya'], ['divya', 'karan']];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const users = db.collection('users');

// wipe previous demo data
const old = await users.find({ email: { $regex: `${DOMAIN.replace('.', '\\.')}$` } }).toArray();
const oldIds = old.map((u) => u._id.toString());
if (oldIds.length) {
  await db.collection('profiles').deleteMany({ _id: { $in: oldIds } });
  await db.collection('posts').deleteMany({ authorId: { $in: oldIds } });
  await db.collection('connections').deleteMany({ users: { $in: oldIds } });
  await db.collection('dms').deleteMany({ $or: [{ from: { $in: oldIds } }, { to: { $in: oldIds } }] });
  await db.collection('posts').updateMany({}, { $pull: { likes: { $in: oldIds }, comments: { userId: { $in: oldIds } } } });
  await users.deleteMany({ _id: { $in: old.map((u) => u._id) } });
}

const me = meEmail ? await users.findOne({ email: meEmail }) : null;
if (meEmail && !me) console.warn(`No account with email ${meEmail}; seeding without connecting it.`);

const passwordHash = await hashPassword('Demo@1234');
const ids = {};
const names = {};
for (const [i, p] of PEOPLE.entries()) {
  const created = hoursAgo(24 * (60 - i * 4));
  const res = await users.insertOne({ name: p.name, email: `${p.key}${DOMAIN}`, passwordHash, role: 'user', provider: null, providerId: null, tokenVersion: 0, createdAt: created, updatedAt: created, lastLoginAt: hoursAgo(i * 5 + 1) });
  ids[p.key] = res.insertedId.toString();
  names[p.key] = p.name;
  const { key, ...profile } = p;
  await db.collection('profiles').insertOne({ _id: ids[key], ...profile, mentor: !!p.mentor, mentee: !!p.mentee, createdAt: created, updatedAt: hoursAgo(i * 7 + 2) });
}
if (me) {
  ids.me = me._id.toString();
  names.me = me.name;
}
const has = (k) => ids[k] !== undefined;

const conns = [];
const conn = (a, b, status, requester) => conns.push({ _id: pairKey(ids[a], ids[b]), users: [ids[requester], ids[requester === a ? b : a]], requester: ids[requester], status, createdAt: hoursAgo(300), updatedAt: hoursAgo(200) });
for (const [a, b] of AMONG) conn(a, b, 'accepted', a);
if (me) {
  for (const k of CONNECTED) conn(k, 'me', 'accepted', k);
  for (const k of INCOMING) conn(k, 'me', 'pending', k);
}
await db.collection('connections').insertMany(conns);

await db.collection('posts').insertMany(
  POSTS.map(([author, h, text, likers, comments]) => ({
    authorId: ids[author],
    authorName: names[author],
    authorPhotoKey: null,
    text,
    imageKey: null,
    likes: likers.filter(has).map((k) => ids[k]),
    comments: comments.map(([k, t], j) => ({ id: rid(), userId: ids[k], name: names[k], text: t, ts: hoursAgo(h - 0.5 - j * 0.4).getTime() })),
    createdAt: hoursAgo(h),
  })),
);

let dmCount = 0;
if (me) {
  const docs = DMS.flatMap(([k, msgs]) =>
    msgs.map(([fromMe, text, h]) => {
      const [from, to] = fromMe ? ['me', k] : [k, 'me'];
      return { convId: pairKey(ids.me, ids[k]), from: ids[from], fromName: names[from], to: ids[to], text, ts: hoursAgo(h).getTime() };
    }),
  );
  await db.collection('dms').insertMany(docs);
  dmCount = docs.length;
}

console.log(`Seeded ${PEOPLE.length} people, ${conns.length} connections, ${POSTS.length} posts, ${dmCount} messages${me ? ` (connected to ${me.email})` : ''}.`);
console.log(`Demo logins: <name>${DOMAIN} / Demo@1234, e.g. priya${DOMAIN}`);
await client.close();
