const fs = require('fs');
let server = fs.readFileSync('src/server.ts', 'utf8');

// Replace MONGO_URI assignment
server = server.replace(
  "const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/playbimboo';",
  "const MONGO_URI = process.env.MONGO_URI;"
);

// Replace connectDB
const oldConnectDB = \`const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(\\\`Connected to MongoDB database at \${MONGO_URI}\\\`);
  } catch (err: any) {
    console.warn('Primary MongoDB Connection Failed:', err.message);
    if (MONGO_URI.includes('localhost') || MONGO_URI.includes('127.0.0.1')) {
      console.log('Attempting to start local MongoDB Memory Server as fallback...');
      try {
        const mongoServer = await MongoMemoryServer.create();
        const memoryUri = mongoServer.getUri();
        await mongoose.connect(memoryUri);
        console.log(\\\`Connected to Fallback MongoDB Memory Server at \${memoryUri}\\\`);
        
        // Seed the memory database automatically since it's fresh
        try {
          const fetch = (await import('node-fetch')).default || global.fetch;
          setTimeout(() => {
            fetch(\\\`http://localhost:\${PORT}/api/seed/admin\\\`, { method: 'POST' }).catch(() => {});
          }, 2000);
        } catch (e) {}

      } catch (memErr: any) {
        console.error('Failed to start MongoDB Memory Server:', memErr.message);
      }
    } else {
      console.warn('Backend API will run in standalone mode with fallback handlers.');
    }
  }
};\`;

const newConnectDB = \`const connectDB = async () => {
  if (!MONGO_URI) {
    console.log('No MONGO_URI provided in .env. Falling back to MongoDB Memory Server...');
    try {
      const mongoServer = await MongoMemoryServer.create();
      const memoryUri = mongoServer.getUri();
      await mongoose.connect(memoryUri);
      console.log(\\\`Connected to Fallback MongoDB Memory Server at \${memoryUri}\\\`);
      
      // Seed the memory database automatically since it's fresh
      try {
        const fetch = (await import('node-fetch')).default || global.fetch;
        setTimeout(() => {
          fetch(\\\`http://localhost:\${PORT}/api/seed/admin\\\`, { method: 'POST' }).catch(() => {});
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
};\`;

server = server.replace(oldConnectDB, newConnectDB);
fs.writeFileSync('src/server.ts', server);
console.log('server.ts updated');
