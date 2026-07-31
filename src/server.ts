import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'dns';
import path from 'path';

// Fix for Node.js SRV resolution issue on certain windows environments
dns.setServers(['8.8.8.8', '8.8.4.4']);

import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import orderRoutes from './routes/orders.js';
import couponRoutes from './routes/coupons.js';
import settingsRoutes from './routes/settings.js';
import uploadRoutes from './routes/upload.js';
import seedRoutes from './routes/seed.js';
import authRoutes from './routes/auth.js';
import reviewRoutes from './routes/reviews.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000'
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(o => origin && origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded static files
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'PlayBimboo Express API Backend',
    dbConnected: mongoose.connection.readyState === 1
  });
});

// Routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);

// Database Connection
import { MongoMemoryServer } from 'mongodb-memory-server';

const connectDB = async () => {
  if (!MONGO_URI) {
    console.log('No MONGO_URI provided in .env. Falling back to MongoDB Memory Server...');
    try {
      const mongoServer = await MongoMemoryServer.create();
      const memoryUri = mongoServer.getUri();
      await mongoose.connect(memoryUri);
      console.log(`Connected to Fallback MongoDB Memory Server at ${memoryUri}`);
      
      // Seed the memory database automatically since it's fresh
      try {
        const fetch = (await import('node-fetch')).default || global.fetch;
        setTimeout(() => {
          fetch(`http://localhost:${PORT}/api/seed/admin`, { method: 'POST' }).catch(() => {});
        }, 2000);
      } catch (e) {}

    } catch (memErr: any) {
      console.error('Failed to start MongoDB Memory Server:', memErr.message);
    }
  } else {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('Successfully connected to persistent MongoDB database.');
    } catch (err: any) {
      console.error('CRITICAL ERROR: Failed to connect to persistent MongoDB database at provided URI.');
      console.error('Error Details:', err.message);
      console.warn('Backend API will run in standalone mode, but database operations will fail.');
    }
  }
};

connectDB();

app.listen(PORT, () => {
  console.log(`PlayBimboo Backend API running on http://localhost:${PORT}`);
});
