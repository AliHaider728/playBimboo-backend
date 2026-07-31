import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import { connectToDatabase } from './lib/database.js';

const app = express();

const configuredFrontendUrl = process.env.FRONTEND_URL?.trim();
const allowedOrigins = [
  'https://play-bimboo.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  ...(configuredFrontendUrl ? [configuredFrontendUrl] : [])
];

const corsOptions: CorsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

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
