import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import { connectToDatabase } from './lib/database.js';
import { migrateSettings } from './lib/migrateSettings.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import couponRoutes from './routes/coupons.js';
import settingsRoutes from './routes/settings.js';
import reviewRoutes from './routes/reviews.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import seedRoutes from './routes/seed.js';
import globalAttributeRoutes from './routes/globalAttributes.js';
import contactRoutes from './routes/contact.js';

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const requireDatabaseConnection = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await connectToDatabase();
    next();
  } catch {
    console.error('MongoDB request connection failed.');
    res.status(503).json({ error: 'Database connection unavailable' });
  }
};

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const mongoose = await connectToDatabase();
    // Run migration once per boot when DB is reachable
    void migrateSettings();
    res.json({
      status: 'ok',
      dbConnected: mongoose.connection.readyState === 1
    });
  } catch {
    console.error('MongoDB health check failed.');
    res.status(503).json({
      status: 'error',
      dbConnected: false,
      error: 'Database connection unavailable'
    });
  }
});

app.use('/api/categories', requireDatabaseConnection, categoryRoutes);
app.use('/api/products', requireDatabaseConnection, productRoutes);
app.use('/api/global-attributes', requireDatabaseConnection, globalAttributeRoutes);
app.use('/api/orders', requireDatabaseConnection, orderRoutes);
app.use('/api/coupons', requireDatabaseConnection, couponRoutes);
app.use('/api/settings', requireDatabaseConnection, settingsRoutes);
app.use('/api/reviews', requireDatabaseConnection, reviewRoutes);
app.use('/api/auth', requireDatabaseConnection, authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/seed', requireDatabaseConnection, seedRoutes);
app.use('/api/contact', requireDatabaseConnection, contactRoutes);

export default app;
