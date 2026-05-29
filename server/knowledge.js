import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge', 'growth-plan');
const CACHE_FILE = path.join(KNOWLEDGE_DIR, '.uploads.json');

let anthropic = null;
function getClient() {
  if (anthropic) return anthropic;
  const apiKey = process.env.ANTHROPIC_KEY_PRODUCTION;
  if (!apiKey) return null;
  anthropic = new Anthropic({ apiKey });
  return anthropic;
}

let loadedDocs = [];
let lastLoadedAt = null;
let lastError = null;
let isLoading = false;

async function readCache() {
  try {
    const text = await fsp.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    console.warn('[knowledge] cache read error:', err.message);
    return {};
  }
}

async function writeCache(data) {
  try {
    await fsp.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('[knowledge] cache write error:', err.message);
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function isFileStillValid(client, fileId) {
  try {
    await client.beta.files.retrieveMetadata(fileId);
    return true;
  } catch {
    return false;
  }
}

export async function loadKnowledge() {
  if (isLoading) {
    return { status: 'already_loading' };
  }
  isLoading = true;
  lastError = null;

  try {
    try {
      await fsp.mkdir(KNOWLEDGE_DIR, { recursive: true });
    } catch (err) {
      lastError = `Failed to create knowledge dir: ${err.message}`;
      console.warn('[knowledge]', lastError);
      return;
    }

    let pdfFiles;
    try {
      const entries = await fsp.readdir(KNOWLEDGE_DIR);
      pdfFiles = entries.filter(f => f.toLowerCase().endsWith('.pdf')).sort();
    } catch (err) {
      lastError = `Failed to read knowledge dir: ${err.message}`;
      console.warn('[knowledge]', lastError);
      return;
    }

    if (pdfFiles.length === 0) {
      loadedDocs = [];
      lastLoadedAt = new Date().toISOString();
      console.log('[knowledge] no PDFs in knowledge/growth-plan/ — knowledge base empty');
      return;
    }

    const client = getClient();
    if (!client) {
      lastError = 'ANTHROPIC_KEY_PRODUCTION not set';
      console.warn('[knowledge]', lastError);
      return;
    }

    const cache = await readCache();
    const newCache = {};
    const newDocs = [];

    for (const filename of pdfFiles) {
      const filePath = path.join(KNOWLEDGE_DIR, filename);
      try {
        const stat = await fsp.stat(filePath);
        const sha = await sha256File(filePath);
        const cached = cache[filename];

        let fileId = null;
        let uploadedAt = null;

        if (cached && cached.sha256 === sha && cached.file_id) {
          const stillValid = await isFileStillValid(client, cached.file_id);
          if (stillValid) {
            fileId = cached.file_id;
            uploadedAt = cached.uploaded_at;
            console.log(`[knowledge] reusing cached upload: ${filename}`);
          }
        }

        if (!fileId) {
          console.log(`[knowledge] uploading ${filename} (${stat.size} bytes)…`);
          const file = await toFile(fs.createReadStream(filePath), filename, {
            type: 'application/pdf'
          });
          const uploaded = await client.beta.files.upload({ file });
          fileId = uploaded.id;
          uploadedAt = new Date().toISOString();
          console.log(`[knowledge] uploaded ${filename} → ${fileId}`);
        }

        newCache[filename] = {
          sha256: sha,
          file_id: fileId,
          size_bytes: stat.size,
          uploaded_at: uploadedAt
        };
        newDocs.push({
          filename,
          file_id: fileId,
          size_bytes: stat.size,
          sha256: sha,
          uploaded_at: uploadedAt
        });
      } catch (err) {
        console.warn(`[knowledge] failed to load ${filename}:`, err.message);
      }
    }

    await writeCache(newCache);
    loadedDocs = newDocs;
    lastLoadedAt = new Date().toISOString();

    const totalKb = Math.round(newDocs.reduce((s, d) => s + d.size_bytes, 0) / 1024);
    console.log(`[knowledge] loaded ${newDocs.length}/${pdfFiles.length} documents (${totalKb} KB total)`);
  } finally {
    isLoading = false;
  }
}

export function getLoadedDocs() {
  return loadedDocs.slice();
}

export function getKnowledgeStatus() {
  return {
    loaded_documents: loadedDocs.map(d => ({
      filename: d.filename,
      size_bytes: d.size_bytes
    })),
    total_size_bytes: loadedDocs.reduce((s, d) => s + d.size_bytes, 0),
    document_count: loadedDocs.length,
    last_loaded: lastLoadedAt,
    error: lastError
  };
}
