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

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const app = express();

const configuredFrontendUrl = process.env.FRONTEND_URL?.trim();
const allowedOrigins = [
  'https://playbimboo.com',
  'https://www.playbimboo.com',
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

app.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    const mongoose = await connectToDatabase();
    dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: 'online',
    message: 'PlayBimboo API Backend is running',
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

// cPanel/Passenger expects module.exports, not TypeScript's exports.default.
if (typeof module !== 'undefined') {
  module.exports = app;
}

const isPassengerRuntime = Boolean(
  process.env.PASSENGER_APP_ENV || process.env.PASSENGER_BASE_URI
);

// If not running in a serverless environment (e.g. running directly via node/tsx)
if (
  typeof require !== 'undefined' &&
  require.main === module &&
  !isPassengerRuntime
) {
  const port = Number.parseInt(process.env.PORT ?? '5000', 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  // Managed runtimes (cPanel/Passenger, PaaS) assign the port themselves and
  // run many apps per host, so a "port in use" reading there is meaningless —
  // and exiting on it means the app never listens and the vhost serves 503.
  const isManagedRuntime =
    process.env.NODE_ENV === 'production' || Boolean(process.env.PASSENGER_BASE_URI);

  async function checkPortAndStart() {
    if (!isManagedRuntime) {
      try {
        const { stdout } = await execAsync(
          process.platform === 'win32'
            ? `netstat -ano | findstr :${port}`
            : `lsof -i :${port} | grep LISTEN`
        );

        if (stdout.trim()) {
          const match = process.platform === 'win32'
            ? stdout.trim().match(/LISTENING\s+(\d+)/i)
            : stdout.trim().match(/\s+(\d+)\s+/);

          const pid = match ? match[1] : 'Unknown';
          console.error(`\n🚨 ERROR: Port ${port} is already in use.`);
          console.error(`The backend may already be running. Check PID ${pid} before starting another instance.\n`);
          process.exit(1);
        }
      } catch (err) {
        // Port is likely free if command fails
      }
    }

    const server = app.listen(port, async () => {
      try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) throw new Error('Database not connected properly');
        const dbName = db.databaseName;

        const [products, reviews, orders, categories, coupons, users] = await Promise.all([
          db.collection('products').countDocuments(),
          db.collection('reviews').countDocuments(),
          db.collection('orders').countDocuments(),
          db.collection('categories').countDocuments(),
          db.collection('coupons').countDocuments(),
          db.collection('users').countDocuments()
        ]);

        console.log('\n=========================================');
        console.log('  PlayBimboo Backend API');
        console.log(`  Status: RUNNING on http://localhost:${port}`);
        console.log(`  Database: CONNECTED (${dbName})`);
        console.log(`  Products: ${products} | Reviews: ${reviews} | Orders: ${orders}`);
        console.log(`  Categories: ${categories} | Coupons: ${coupons} | Users: ${users}`);
        console.log('=========================================\n');
      } catch (err) {
        console.log('\n=========================================');
        console.log('  PlayBimboo Backend API');
        console.log(`  Status: RUNNING on http://localhost:${port}`);
        console.log('  Database: DISCONNECTED (Error connecting)');
        console.log('=========================================\n');
      }
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n🚨 ERROR: Port ${port} is already in use by another process.`);
        console.error(`Please stop the process running on port ${port} or specify a different port using process.env.PORT.\n`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  }

  checkPortAndStart();
}