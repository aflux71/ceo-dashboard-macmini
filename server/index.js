import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import { startScheduler } from './scheduler.js';
import { loadKnowledge } from './knowledge.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'neob-production-assistant',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', apiRoutes);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`neōb Production Assistant running on port ${PORT}`);
  startScheduler();
  loadKnowledge().catch(err => console.error('[knowledge] boot load failed:', err.message));
});
