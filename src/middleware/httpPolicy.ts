import cors from 'cors';
import { RequestHandler } from 'express';

const productionOrigins = new Set([
  'https://playbimboo.com',
  'https://www.playbimboo.com',
  'https://admin.playbimboo.com',
  'https://play-bimboo.vercel.app'
]);

export const isAllowedOrigin = (origin: string): boolean => {
  if (productionOrigins.has(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
};

export const apiCors = cors({
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 600,
  optionsSuccessStatus: 204
});

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-LiteSpeed-Cache-Control', 'no-cache');
  res.vary('Origin');
  next();
};
