import express from 'express';
import cors from 'cors';
import analysisRouter from './routes/analysis.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1', analysisRouter);

app.listen(PORT, () => {
  console.log(`Repo-Guardian backend running on http://localhost:${PORT}`);
});
