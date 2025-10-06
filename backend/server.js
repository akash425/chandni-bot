import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import { ChromaClient } from 'chromadb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || 'persona-knowledge';
const PERSONA_NAME = process.env.PERSONA_NAME || 'Chandni';

// Persona loader
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadPersona() {
  const filename = `${(PERSONA_NAME || '').toLowerCase()}.json`;
  const personaPath = path.join(__dirname, 'personas', filename);
  try {
    const raw = fs.readFileSync(personaPath, 'utf-8');
    const data = JSON.parse(raw);
    return data;
  } catch (e) {
    console.warn(`[WARN] Persona file not found or invalid at ${personaPath}. Using fallback.`);
    return {
      name: PERSONA_NAME,
      displayName: `${PERSONA_NAME}Bot`,
      emoji: '👩‍💻',
      greeting: `Hey! I’m ${PERSONA_NAME}Bot. What’s up? 🙂`,
      style: {
        tone: 'witty, supportive, technically precise',
        register: 'slightly casual Slack style',
        signaturePhrases: [
          'Hmm, I’d suggest…',
          'Okay, try this approach…',
          'Let’s sanity-check that assumption.'
        ],
        do: [
          'be concise with bullets and steps',
          'include short code snippets when useful',
          'add a light emoji occasionally'
        ],
        dont: [
          'overuse emojis',
          'be condescending',
          'hallucinate beyond provided context'
        ]
      },
      easterEggs: [
        { trigger: 'on-call', response: 'coffee first ☕' },
        { trigger: 'hotfix', response: 'ship it, but add a follow-up ticket' },
        { trigger: 'monorepo', response: 'keep calm and enforce ownership' }
      ],
      guardrails: {
        refuseTopics: [
          'sensitive personal data',
          'company confidential outside approved context'
        ],
        fallback: 'When unsure, ask a brief clarifying question.'
      },
      promptDirectives: {
        formatting: 'Prefer bullet points for steps; keep paragraphs short.',
        code: 'Provide language-tagged code blocks; explain briefly.'
      }
    };
  }
}

const persona = loadPersona();

// Team loader
function loadTeamDirectory() {
  const teamDir = path.join(__dirname, 'team');
  const members = new Map();
  try {
    if (!fs.existsSync(teamDir)) return members;
    const files = fs.readdirSync(teamDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(teamDir, file), 'utf-8');
        const json = JSON.parse(raw);
        const key = json.key || path.basename(file, '.json');
        members.set(key, { key, ...json });
      } catch (e) {
        console.warn('[WARN] Failed to parse team file', file, e.message);
      }
    }
  } catch (e) {
    console.warn('[WARN] Failed to load team directory:', e.message);
  }
  return members;
}

let teamMembers = loadTeamDirectory();

function getTeamMember(key) {
  if (!key) return teamMembers.get('general') || null;
  return teamMembers.get(key) || teamMembers.get('general') || null;
}

function buildTeamPrompt(member) {
  if (!member) return '';
  const bullets = (arr) => Array.isArray(arr) && arr.length ? arr.map(x => `- ${x}`).join('\n') : '';
  const jokes = bullets(member?.insiderInfo?.jokes);
  const prefs = bullets(member?.insiderInfo?.preferences);
  const memories = bullets(member?.sharedMemories);
  const avoid = bullets(member?.guardrailsOverrides?.avoidTopics);
  return `Speaker context: ${member.name}${member.nicknames?.length ? ` (aka ${member.nicknames.join(', ')})` : ''}. Role: ${member.role || 'Teammate'}.
Addressing style: ${member?.styleTweaks?.address || 'friendly neutral'}; Humor: ${member?.styleTweaks?.humor || 'light'}.
Insider jokes (use sparingly and only when fitting):\n${jokes}
Preferences:\n${prefs}
Shared memories (reference only if relevant):\n${memories}
Avoid topics for this speaker:\n${avoid}`;
}

if (!OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY is not set. The /ask endpoint will fail until this is configured.');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const chroma = new ChromaClient({ path: CHROMA_URL });

async function getCollection() {
  try {
    const collection = await chroma.getOrCreateCollection({ name: COLLECTION_NAME });
    return collection;
  } catch (err) {
    console.warn('[WARN] ChromaDB is not reachable at', CHROMA_URL, '- proceeding without retrieval. Error:', err?.message || err);
    // Return null so callers can gracefully skip retrieval.
    return null;
  }
}

function buildPersonaPrompt(p) {
  const sp = (arr) => Array.isArray(arr) && arr.length ? arr.join(', ') : '';
  const bullets = (arr) => Array.isArray(arr) && arr.length ? arr.map(x => `- ${x}`).join('\n') : '';
  const sig = bullets(p?.style?.signaturePhrases);
  const doList = bullets(p?.style?.do);
  const dontList = bullets(p?.style?.dont);
  const refuse = sp(p?.guardrails?.refuseTopics);
  const ee = Array.isArray(p?.easterEggs) && p.easterEggs.length
    ? p.easterEggs.map(e => `${e.trigger} → ${e.response}`).join('; ')
    : '';
  const localeSection = p?.locale ? `
Locale: Based in ${p?.locale?.region || 'India'}; prefer ${p?.locale?.languagePreference || 'English'} when appropriate.
Locale examples:\n${bullets(p?.locale?.examples)}
` : '';
  const smallTalkSection = p?.smallTalk?.allow ? `
Small talk: Allowed. Offer brief, friendly replies when the user engages in casual conversation.
Small talk examples:\n${bullets(p?.smallTalk?.examples)}
` : '';
  const jokesSection = Array.isArray(p?.jokes) && p.jokes.length ? `
Humor: Use light humor occasionally when suitable. Example: ${p.jokes[0]}
` : '';
  const memoriesSection = Array.isArray(p?.memories) && p.memories.length ? `
Shared memories: You may reference team memories sparingly if relevant:\n${bullets(p.memories.slice(0, 2))}
` : '';

  return `You are ${p?.name || PERSONA_NAME}, a ${p?.style?.tone || 'witty, supportive, technically precise'} technical leader who speaks in a ${p?.style?.register || 'slightly casual Slack style'}.
You often use phrases:\n${sig}
Do:\n${doList}
Don't:\n${dontList}
${localeSection}${smallTalkSection}${jokesSection}${memoriesSection}
Formatting: ${p?.promptDirectives?.formatting || 'Prefer bullet points for steps; keep paragraphs short.'}
Code: ${p?.promptDirectives?.code || 'Provide language-tagged code blocks; explain briefly.'}
Guardrails: Refuse topics ${refuse}. If unsure: ${p?.guardrails?.fallback || 'ask a brief clarifying question.'}
Easter eggs (sparingly, only when relevant): ${ee}
Respond as if in a Slack conversation. Keep it concise and helpful.`;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: persona?.displayName || `${PERSONA_NAME}Bot`, chroma: CHROMA_URL });
});

// Expose persona metadata (safe fields only)
app.get('/persona', (req, res) => {
  const { name, displayName, emoji, greeting } = persona || {};
  res.json({ name, displayName, emoji, greeting });
});

// List team members (for UI buttons)
app.get('/team', (req, res) => {
  try {
    // reload on each call in dev to pick up new files without restart
    if (process.env.NODE_ENV !== 'production') {
      teamMembers = loadTeamDirectory();
    }
    const list = Array.from(teamMembers.values()).map(m => ({ key: m.key, name: m.name }));
    res.json({ team: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load team list' });
  }
});

// Get one member public info
app.get('/team/:key', (req, res) => {
  try {
    const key = req.params.key;
    const member = getTeamMember(key);
    if (!member) return res.status(404).json({ error: 'Not found' });
    const { greetingOverride, name, key: k } = member;
    res.json({ key: k, name, greetingOverride });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load team member' });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { question, speaker, history } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Invalid payload. Expected { question: string }.' });
    }

    const collection = await getCollection();

    // 1) Embed the question
    const embeddingResp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const queryEmbedding = embeddingResp.data[0].embedding;

    // 2) Query Chroma for top-k context (robust to small collections)
    let context = '';
    try {
      const total = (await collection.count?.()) ?? undefined;
      const k = total && Number.isFinite(total) ? Math.max(1, Math.min(2, Number(total))) : 2;
      const queryRes = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: k,
        include: ['documents', 'metadatas', 'distances'],
      });

      const docs = (queryRes.documents?.[0] || []);
      const metas = (queryRes.metadatas?.[0] || []);

      const contextBlocks = docs.map((d, i) => {
        const m = metas[i] || {};
        const source = [m.source, m.title].filter(Boolean).join(' · ');
        return `Source: ${source || 'unknown'}\n${d}`;
      });

      context = contextBlocks.join('\n\n---\n\n');
    } catch (retrievalErr) {
      console.warn('[WARN] Retrieval failed, proceeding without context:', retrievalErr?.message || retrievalErr);
    }

    // 3) Call OpenAI Chat with persona + team speaker + context
    const member = getTeamMember(speaker);
    const teamPrompt = buildTeamPrompt(member);
    // sanitize and limit history to last 6 turns
    const safeHistory = Array.isArray(history)
      ? history
          .filter(h => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant'))
          .slice(-6)
          .map(h => ({ role: h.role, content: h.content }))
      : [];
    const messages = [
      {
        role: 'system',
        content: buildPersonaPrompt(persona),
      },
      {
        role: 'system',
        content: teamPrompt,
      },
      {
        role: 'system',
        content: `Use the following context from ${persona?.name || PERSONA_NAME}'s notes and chats if relevant. If the context is not relevant, answer from general knowledge, but keep the voice consistent.\n\n${context}`,
      },
      ...safeHistory,
      {
        role: 'user',
        content: question,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.5,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response.";
    return res.json({ answer });
  } catch (err) {
    console.error('Error in /ask:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`[backend] ${persona?.displayName || PERSONA_NAME + 'Bot'} API listening on http://localhost:${PORT}`);
});
