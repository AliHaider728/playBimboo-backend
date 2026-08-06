import 'dotenv/config';
import app from './server.js';

const port = Number.parseInt(process.env.PORT ?? '5000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = app.listen(port, () => {
  console.log(`PlayBimboo Backend API running on http://localhost:${port}`);
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
