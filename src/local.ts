import 'dotenv/config';
import app from './server.js';

const port = Number.parseInt(process.env.PORT ?? '5000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.listen(port, () => {
  console.log(`PlayBimboo Backend API running on http://localhost:${port}`);
});
