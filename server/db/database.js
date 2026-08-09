import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Defaults to the production DB. NEOB_DB_PATH exists so data-WRITING features can be
// exercised against a throwaway copy (including deliberate-failure/rollback tests)
// without a test run ever being able to touch data/neob.db. Unset in production.
const DB_PATH = process.env.NEOB_DB_PATH
  ? path.resolve(process.env.NEOB_DB_PATH)
  : path.join(__dirname, '../../data/neob.db');

import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
