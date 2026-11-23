// AI CV builder chat (Gemini). The member chats; each turn the model replies AND
// returns the updated CV as structured JSON, which the Resume page renders live.
//
// The model's instructions = the master prompt (admin-editable, see DEFAULT_CV_PROMPT)
// + CV_PROMPT_RULES (fixed: never invent facts, and the JSON output contract).
// Output is validated and size-capped here — never trusted as-is.
import { HttpError, readJson, sendJson } from './http.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { isSuperAdmin } from './auth/roles.js';
import { actorOf, recordAudit } from './audit.js';

// Text the member sees never contains the long dash (U+2014): the app's style uses
// commas instead. The model is told so, and anything that slips through is fixed here.
const noLongDash = (t) => t.replace(/\s*\u2014\s*/g, ', ').replace(/,\s*([,.!?])/g, '$1');
const str = (v, max) => (typeof v === 'string' ? noLongDash(v.trim()).slice(0, max) : '');
const strArr = (v, maxItems, maxLen) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);

/** Keep only known CV fields, trimmed to sane sizes. */
export function cleanCv(v) {
  const c = v && typeof v === 'object' ? v : {};
  return {
    name: str(c.name, 120),
    title: str(c.title, 160),
    email: str(c.email, 200),
    phone: str(c.phone, 60),
    location: str(c.location, 120),
    summary: str(c.summary, 1500),
    skills: strArr(c.skills, 40, 60),
    experience: (Array.isArray(c.experience) ? c.experience : []).slice(0, 12).map((x) => ({
      title: str(x?.title, 120), company: str(x?.company, 120), start: str(x?.start, 30), end: str(x?.end, 30), description: str(x?.description, 2000),
    })).filter((x) => x.title || x.company),
    education: (Array.isArray(c.education) ? c.education : []).slice(0, 8).map((x) => ({
      degree: str(x?.degree, 160), school: str(x?.school, 160), year: str(x?.year, 30),
    })).filter((x) => x.degree || x.school),
  };
}

/**
 * The master prompt — persona, interview style and writing rules. Super-admins can
 * replace it from the Admin console (AI CV Prompt); this is the default.
 */
export const DEFAULT_CV_PROMPT = `You are Huddle AI CV Co-Pilot, an encouraging, smart and practical career & resume builder. You help anyone, freshers and students, blue-collar and service workers, call-centre / BPO and customer-support agents, nurses and doctors, chefs and hospitality staff, retail and sales, HR, and software engineers, create a job-winning, ATS-friendly CV in 3 simple steps with the fewest possible inputs.

CORE RULES
1. Never overwhelm the member with a long form. Ask only ONE short, friendly question per turn, in plain simple English (or their language).
2. After every question, offer 4–6 tappable "Smart Suggestion Chips": short ready-made answers, so members who struggle to write in English or don't know resume buzzwords can build a strong CV in one tap. Make chips specific to their profession and to the question just asked.
3. Automatically upgrade weak or simple inputs ("good communication", "call handling", "cooking") into high-impact, recruiter-approved CV bullets that start with an action verb. When a number would make a bullet stronger but the member hasn't given one, use a clearly bracketed placeholder such as [X+ calls/day], [95%+ CSAT], [₹X lakh monthly sales], [X covers/shift], never a made-up number.
4. Adapt tone and keywords to the profession:
   - Customer support / call centre / BPO → empathy, CSAT, FCR (first-call resolution), AHT, CRM tools (Salesforce, Zendesk, Freshdesk), active listening, escalation handling, multilingual fluency.
   - Tech / engineering → tech stack, system design / architecture, performance, latency / uptime, testing, delivery ownership.
   - Healthcare → patient care, clinical protocols, hygiene / infection control, patient volume, documentation, licences / registrations.
   - Hospitality / chefs / retail → guest care, food safety & hygiene (HACCP / FSSAI), daily covers or footfall, upselling, inventory, speed of service.
   - Sales / business development → targets vs achievement, revenue, pipeline, conversion, client retention, territory.
   - HR / operations / admin → hiring volume, onboarding, payroll / HRMS tools, compliance, process improvement.
   - Skilled trades / drivers / technicians / delivery → licences, safety record, equipment and tools, on-time rate, reliability.
   - Freshers / students → education, internships, academic projects, certifications, extracurriculars, soft skills, willingness to learn.
5. The 3 minimum inputs are: (1) target role, (2) experience or education, (3) key strengths / skills. As soon as you have these three, IMMEDIATELY produce a complete CV draft, do not keep asking first. In that same reply give "Next-Level Suggestions": 3 missing keywords for the target role, 2 stronger bullet upgrades, and 1 tailored cover-note line they can paste into an application.
6. After the first draft, keep improving it one question at a time: real numbers for any [placeholders], earlier jobs, certifications, languages spoken, tools, contact details. Tell the member they can download or share their CV whenever they like.

ATS & QUALITY RULES
- Standard headings only (Summary, Experience, Education, Skills). Reverse-chronological order. No tables, icons or graphics in the text.
- Professional summary: 2–3 lines naming the target role, years of experience (if given) and 2–3 strongest strengths.
- 3–5 bullets per job, most impressive first, each under about 25 words.
- Skills: 6–12 items, mixing role keywords, tools and relevant soft skills.
- Fit to one page for under ~8 years of experience.

BEHAVIOUR
- Be warm and encouraging, never judgemental. Explain any jargon in simple words.
- Write the CV in English unless the member asks otherwise; reply in chat in the same language the member uses (Hindi, Hinglish and other languages are welcome).
- Career gaps, job changes or no experience are fine, frame them positively and honestly (projects, freelance, family care, upskilling).
- Never ask for or include age, date of birth, religion, caste, marital status, photo, ID numbers (Aadhaar, PAN, passport) or salary history.
- Don't promise interviews or jobs.`;

/** Always appended after the master prompt (admins can't edit it): honesty + the app's output contract. */
export const CV_PROMPT_RULES = `NON-NEGOTIABLE RULES (from the Huddle app)
- NEVER invent facts: no made-up employers, job titles, dates, degrees, schools, certifications or numbers. Missing numbers use [bracketed placeholders]; other missing details are asked for or left out. You may improve wording only.
- Keep CV fields you were given unless the member corrects them.
- Never use the long dash character (U+2014) anywhere; use a comma, colon or full stop instead.

OUTPUT FORMAT (the app depends on it)
- Respond with JSON only, matching the schema: reply, progress, suggestions, cv.
- "cv" is the full, updated CV every turn. The app renders it as the formatted ATS CV the member sees, downloads and shares, so never paste the whole CV into "reply". Put each experience bullet on its own line starting with "• ".
- "reply" is your chat message: plain text (no Markdown symbols such as ** or #), under 120 words, except the turn with the first full draft, where it holds the Next-Level Suggestions (use short "• " lines) and may run to about 180 words. End with exactly one question.
- "suggestions" are the 4–6 Smart Suggestion Chips, each under 8 words, answering your question.
- "progress" is your honest 0–100 estimate of how complete and strong the CV is.`;

export const CV_PROMPT_KEY = 'ai.cvPrompt';
export const MAX_PROMPT_CHARS = 12_000;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your chat message to the member.' },
    progress: { type: 'integer', description: '0-100 completeness estimate.' },
    suggestions: { type: 'array', items: { type: 'string' }, description: '4-6 Smart Suggestion Chips.' },
    cv: {
      type: 'object',
      properties: {
        name: { type: 'string' }, title: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
        location: { type: 'string' }, summary: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        experience: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' }, company: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'company', 'start', 'end', 'description'] },
        },
        education: {
          type: 'array',
          items: { type: 'object', properties: { degree: { type: 'string' }, school: { type: 'string' }, year: { type: 'string' } }, required: ['degree', 'school', 'year'] },
        },
      },
      required: ['name', 'title', 'email', 'phone', 'location', 'summary', 'skills', 'experience', 'education'],
    },
  },
  required: ['reply', 'progress', 'suggestions', 'cv'],
};

const MODEL_TIMEOUT_MS = 30_000;
let client = null;

/**
 * The default model call — Gemini Interactions API with JSON output. Injectable for tests.
 * store:false — members' CV conversations aren't kept on Google's side (we send the
 * transcript each turn instead). No temperature: newer Gemini models ignore it.
 */
async function geminiGenerate({ apiKey, model, system, input, schema }) {
  if (!client) {
    const { GoogleGenAI } = await import('@google/genai');
    client = new GoogleGenAI({ apiKey });
  }
  const call = client.interactions.create({
    model,
    system_instruction: system,
    input,
    generation_config: { thinking_level: model.includes('flash-lite') ? 'minimal' : 'low' },
    response_format: { type: 'text', mime_type: 'application/json', schema },
    store: false,
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('model timeout'), { status: 504 })), MODEL_TIMEOUT_MS));
  const res = await Promise.race([call, timeout]);
  return res.output_text ?? '';
}
/** Overloaded / rate-limited / slow → worth one try on the fallback model. */
const retryable = (err) => [429, 500, 503, 504].includes(Number(err?.status ?? err?.code)) || /overload|high demand|timeout|unavailable/i.test(String(err?.message));

/**
 * @param {{ apiKey?: string, model?: string, fallbackModel?: string, requireUser: Function, settings?: object, log?: Function, generate?: Function }} deps
 */
export function createCvChat({ apiKey = '', model = 'gemini-3.5-flash-lite', fallbackModel = '', requireUser, settings = null, log = () => {}, generate = geminiGenerate }) {
  const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
  const configured = !!apiKey;

  // The admin-edited master prompt, cached (refreshed on every admin change).
  let cached; // undefined = not loaded yet; null = use the default
  async function promptDoc() {
    if (cached === undefined) {
      try { cached = (await settings?.get(CV_PROMPT_KEY)) ?? null; } catch (err) { log('cv prompt load failed', String(err?.message ?? err)); return null; }
    }
    return cached;
  }
  const systemPrompt = async () => `${(await promptDoc())?.value || DEFAULT_CV_PROMPT}\n\n${CV_PROMPT_RULES}`;

  async function requireAdmin(req) {
    const user = await requireUser(req);
    if (!isSuperAdmin(user.role)) throw new HttpError(403, 'Super-admins only.', { code: 'forbidden' });
    return user;
  }
  async function promptState() {
    const doc = await promptDoc();
    return {
      prompt: doc?.value || DEFAULT_CV_PROMPT,
      isDefault: !doc?.value,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      updatedBy: doc?.updatedBy ?? null,
      defaultPrompt: DEFAULT_CV_PROMPT,
      fixedRules: CV_PROMPT_RULES,
      maxChars: MAX_PROMPT_CHARS,
    };
  }
  async function adminPrompt(req, res) {
    const user = await requireAdmin(req);
    if (!settings) throw new HttpError(503, 'Settings storage isn’t available.');
    if (req.method === 'PUT') {
      const b = await readJson(req, 64 * 1024);
      const prompt = typeof b.prompt === 'string' ? b.prompt.replace(/\r\n/g, '\n').trim() : '';
      if (prompt.length < 50) throw new HttpError(400, 'The prompt is too short, write at least a few sentences.');
      if (prompt.length > MAX_PROMPT_CHARS) throw new HttpError(400, `Keep the prompt under ${MAX_PROMPT_CHARS.toLocaleString('en')} characters.`);
      cached = await settings.set(CV_PROMPT_KEY, prompt, user.name || user.email || user.id);
      recordAudit({ ...actorOf(user), action: 'updated the AI CV builder prompt', category: 'admin', meta: `${prompt.length} chars` });
    } else {
      await settings.remove(CV_PROMPT_KEY);
      cached = null;
      recordAudit({ ...actorOf(user), action: 'reset the AI CV builder prompt to default', category: 'admin' });
    }
    log(`cv prompt ${req.method === 'PUT' ? 'updated' : 'reset'} by ${user.id}`);
    sendJson(res, 200, await promptState());
  }

  async function chat(req, res) {
    const user = await requireUser(req);
    if (!configured) throw new HttpError(503, 'The AI CV builder isn’t set up on this server yet.');
    const lim = limiter.hit(user.id);
    if (!lim.ok) throw new HttpError(429, 'You’re sending messages quickly, wait a moment and try again.', { retryAfterSec: lim.retryAfterSec });

    const b = await readJson(req, 128 * 1024); // transcript + CV can exceed the 16 KB default
    const history = (Array.isArray(b.messages) ? b.messages : []).slice(-24)
      .map((m) => ({ role: m?.role === 'assistant' ? 'model' : 'user', text: str(m?.text, 2000) }))
      .filter((m) => m.text);
    if (!history.length || history[history.length - 1].role !== 'user') throw new HttpError(400, 'Write a message first.');
    const cv = cleanCv(b.cv);

    // One self-contained input per turn: the transcript, then the current CV draft and the
    // latest message — so the model always edits the real draft.
    const transcript = history.slice(0, -1).map((m) => `${m.role === 'model' ? 'Assistant' : 'Member'}: ${m.text}`).join('\n');
    const input = [
      transcript && `Conversation so far:\n${transcript}`,
      `Current CV (JSON):\n${JSON.stringify(cv)}`,
      `Member: ${history[history.length - 1].text}`,
    ].filter(Boolean).join('\n\n');

    const system = await systemPrompt();
    let raw;
    const t0 = Date.now();
    try {
      try {
        raw = await generate({ apiKey, model, system, input, schema: RESPONSE_SCHEMA });
      } catch (err) {
        if (!fallbackModel || fallbackModel === model || !retryable(err)) throw err;
        log(`cv chat: ${model} failed (${err?.status ?? ''} ${String(err?.message).slice(0, 80)}), trying ${fallbackModel}`);
        raw = await generate({ apiKey, model: fallbackModel, system, input, schema: RESPONSE_SCHEMA });
      }
    } catch (err) {
      log('cv chat: model call failed', String(err?.message ?? err).slice(0, 200));
      throw new HttpError(502, 'The AI assistant is unavailable right now. Please try again in a moment.');
    }
    log(`cv chat: reply in ${Date.now() - t0}ms`);
    let out;
    try { out = JSON.parse(raw); } catch {
      log('cv chat: model returned non-JSON');
      throw new HttpError(502, 'The AI assistant sent an unreadable answer. Please try again.');
    }
    sendJson(res, 200, {
      reply: str(out.reply, 2000) || 'Got it. Tell me more.',
      progress: Math.max(0, Math.min(100, Math.round(Number(out.progress) || 0))),
      suggestions: strArr(out.suggestions, 6, 60),
      cv: cleanCv(out.cv),
    });
  }

  return {
    configured,
    async handle(req, res, pathname) {
      if (pathname === '/api/career/cv-chat/status' && req.method === 'GET') {
        await requireUser(req);
        sendJson(res, 200, { configured });
        return true;
      }
      if (pathname === '/api/career/cv-chat' && req.method === 'POST') { await chat(req, res); return true; }
      if (pathname === '/api/admin/ai/cv-prompt') {
        if (req.method === 'GET') { await requireAdmin(req); sendJson(res, 200, await promptState()); return true; }
        if (req.method === 'PUT' || req.method === 'DELETE') { await adminPrompt(req, res); return true; }
        throw new HttpError(405, 'Method not allowed');
      }
      return false;
    },
    close: () => limiter.close(),
  };
}
