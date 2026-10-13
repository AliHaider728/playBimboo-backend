import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config();
import express, { Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';

import uploadRoutes from './mysql-routes/upload.js';
import { pool } from './mysql-lib/db.js';

import mysqlContactRoutes from './mysql-routes/contact.js';
import mysqlCouponRoutes from './mysql-routes/coupons.js';
import mysqlSettingsRoutes from './mysql-routes/settings.js';
import mysqlGlobalAttributeRoutes from './mysql-routes/globalAttributes.js';
import mysqlCategoryRoutes from './mysql-routes/categories.js';
import mysqlAuthRoutes from './mysql-routes/auth.js';
import mysqlReviewRoutes from './mysql-routes/reviews.js';
import mysqlOrderRoutes from './mysql-routes/orders.js';
import mysqlProductRoutes from './mysql-routes/products.js';
import bundlesRouter from './mysql-routes/bundles.js';
import audioReviewsRouter from './mysql-routes/audioReviews.js';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const app = express();

const allowedOrigins = [
  'https://playbimboo.com',
  'https://www.playbimboo.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://play-bimboo.vercel.app'
];

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const originLower = url.origin.toLowerCase();
    if (allowedOrigins.includes(originLower)) return true;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'playbimboo.com' || hostname.endsWith('.playbimboo.com')) return true;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname === 'play-bimboo.vercel.app') return true;
  } catch {
    // ignore
  }
  return false;
};

// Explicit CORS headers and preflight handler
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    await pool.execute('SELECT 1');
    dbStatus = 'connected (MySQL)';
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: 'online',
    message: 'PlayBimboo API Backend is running (MySQL)',
    database: dbStatus,
    endpoints: [
      '/api/products',
      '/api/categories',
      '/api/global-attributes',
      '/api/orders',
      '/api/reviews',
      '/api/auth',
      '/api/settings',
      '/api/coupons',
      '/api/contact'
    ]
  });
});

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.execute('SELECT 1');
    
    res.json({
      status: 'ok',
      dbConnected: true
    });
  } catch {
    console.error('MySQL health check failed.');
    res.status(503).json({
      status: 'error',
      dbConnected: false,
      error: 'Database connection unavailable'
    });
  }
});

app.use('/api/contact', mysqlContactRoutes);
app.use('/api/coupons', mysqlCouponRoutes);
app.use('/api/settings', mysqlSettingsRoutes);
app.use('/api/global-attributes', mysqlGlobalAttributeRoutes);
app.use('/api/categories', mysqlCategoryRoutes);
app.use('/api/auth', mysqlAuthRoutes);
app.use('/api/reviews', mysqlReviewRoutes);
app.use('/api/orders', mysqlOrderRoutes);
app.use('/api/products', mysqlProductRoutes);
app.use('/api/bundles', bundlesRouter);
app.use('/api/audio-reviews', audioReviewsRouter);
app.use('/api/upload', uploadRoutes);

export default app;

if (typeof module !== 'undefined') {
  module.exports = app;
}

if (typeof require !== 'undefined' && require.main === module) {
  const rawPort = process.env.PORT || '5000';
  const parsedPort = Number.parseInt(rawPort, 10);
  const port = (!Number.isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) ? parsedPort : rawPort;

  const isManagedRuntime =
    process.env.NODE_ENV === 'production' || Boolean(process.env.PASSENGER_BASE_URI);

  async function checkPortAndStart() {
    if (!isManagedRuntime) {
      try {
        const { stdout } = await execAsync(
          process.platform === 'win32'
            ? `netstat -ano | findstr :${port} | findstr LISTENING`
            : `lsof -i :${port} | grep LISTEN`
        );

        if (stdout.trim()) {
          const match = process.platform === 'win32'
            ? stdout.trim().match(/LISTENING\s+(\d+)/i)
            : stdout.trim().match(/\s+(\d+)\s+/);

          const pid = match ? match[1] : 'Unknown';
          console.error(`\n[ERROR] Port ${port} is already in use.`);
          console.error(`The backend may already be running on PID ${pid}.`);
          if (process.platform === 'win32') {
            console.error(`Run this command to kill it: taskkill /PID ${pid} /F\n`);
          } else {
            console.error(`Run this command to kill it: kill -9 ${pid}\n`);
          }
          process.exit(1);
        }
      } catch (err) {
      }
    }

    const server = app.listen(port, async () => {
      try {
        await pool.execute('SELECT 1');
        
        const [[{ count: products }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM products');
        const [[{ count: reviews }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM reviews');
        const [[{ count: orders }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM orders');
        const [[{ count: categories }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM categories');
        const [[{ count: coupons }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM coupons');
        const [[{ count: users }]] = await pool.execute<any>('SELECT COUNT(*) as count FROM users');

        console.log('\n=========================================');
        console.log('  PlayBimboo Backend API (MySQL)');
        console.log(`  Status: RUNNING on http://localhost:${port}`);
        console.log('  Database: CONNECTED (MySQL)');
        console.log(`  Products: ${products} | Reviews: ${reviews} | Orders: ${orders}`);
        console.log(`  Categories: ${categories} | Coupons: ${coupons} | Users: ${users}`);
        console.log('=========================================\n');
      } catch (err) {
        console.log('\n=========================================');
        console.log('  PlayBimboo Backend API (MySQL)');
        console.log(`  Status: RUNNING on http://localhost:${port}`);
        console.log('  Database: DISCONNECTED (MySQL Error)');
        console.log('=========================================\n');
      }
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n[ERROR] Port ${port} is already in use by another process.`);
        console.error(`Please kill the process to restart the backend.`);
        if (process.platform === 'win32') {
          console.error(`Run this command to find the PID:  netstat -ano | findstr :${port}`);
          console.error(`Then kill it:                      taskkill /PID <pid> /F\n`);
        } else {
          console.error(`Run this command to find the PID:  lsof -i :${port}`);
          console.error(`Then kill it:                      kill -9 <pid>\n`);
        }
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  }

  checkPortAndStart();
}
