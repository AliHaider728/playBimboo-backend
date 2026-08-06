import 'dotenv/config';
import app from './server.js';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const port = Number.parseInt(process.env.PORT ?? '5000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

async function checkPortAndStart() {
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
    // Port is likely free if command fails (findstr returns exit code 1 if no match)
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
}

checkPortAndStart();
