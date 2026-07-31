import 'dotenv/config';
import express, { Request, Response } from 'express';
import { connectToDatabase } from './lib/database.js';

const app = express();

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const mongoose = await connectToDatabase();
    res.json({
      status: 'ok',
      dbConnected: mongoose.connection.readyState === 1
    });
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    res.status(503).json({
      status: 'error',
      dbConnected: false,
      error: 'Database connection unavailable'
    });
  }
});

export default app;
