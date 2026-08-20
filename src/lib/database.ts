import mongoose from 'mongoose';

type MongooseClient = typeof mongoose;

interface MongooseCache {
  connection: MongooseClient | null;
  promise: Promise<MongooseClient> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __playBimbooMongoose?: MongooseCache;
};

const cache = globalWithMongoose.__playBimbooMongoose ?? {
  connection: null,
  promise: null
};

globalWithMongoose.__playBimbooMongoose = cache;

export const connectToDatabase = async (): Promise<MongooseClient> => {
  if (cache.connection?.connection.readyState === 1) {
    return cache.connection;
  }

  if (cache.connection) {
    cache.connection = null;
    cache.promise = null;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured');
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
      maxPoolSize: 2,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000
    });
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
};
