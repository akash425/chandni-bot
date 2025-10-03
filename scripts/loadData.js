import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';
import { ChromaClient } from 'chromadb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.argv[2] || path.join(__dirname, 'data');
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || 'persona-knowledge';

if (!process.env.OPENAI_API_KEY) {
  console.error('[ERROR] OPENAI_API_KEY is required');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: CHROMA_URL });

function readAllTextFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...readAllTextFiles(full));
    else if (e.isFile() && (e.name.endsWith('.txt') || e.name.endsWith('.md'))) files.push(full);
  }
  return files;
}

function chunkText(text, chunkSize = 2500, overlap = 200) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + chunkSize);
    const chunk = text.slice(i, end);
    chunks.push(chunk);
    if (end === text.length) break;
    i = end - overlap;
  }
  return chunks;
}

async function main() {
  console.log(`[ingest] Reading from: ${DATA_DIR}`);
  const collection = await chroma.getOrCreateCollection({ name: COLLECTION_NAME });
  const files = readAllTextFiles(DATA_DIR);
  console.log(`[ingest] Found ${files.length} source files`);

  let count = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const chunks = chunkText(raw);
    const title = path.basename(file);

    for (let idx = 0; idx < chunks.length; idx++) {
      const content = chunks[idx];
      // create embedding
      const emb = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
      });
      const vector = emb.data[0].embedding;
      const id = `${title}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await collection.add({
        ids: [id],
        embeddings: [vector],
        documents: [content],
        metadatas: [{ source: file, title }],
      });

      count++;
      if (count % 10 === 0) console.log(`[ingest] Indexed ${count} chunks...`);
    }
  }

  console.log(`[ingest] Done. Total chunks: ${count}`);
}

main().catch((e) => {
  console.error('[ingest] Failed:', e);
  process.exit(1);
});
