'use strict';

const path = require('path');
process.chdir(__dirname);
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Exit on fatal errors so Passenger can replace the failed worker.
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  process.exit(1);
});

const exported = require('./dist/server.js');
const app = exported.default || exported;
const rawPort = process.env.PORT || '5000';
const port = /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort;
const server = app.listen(port, () => {
  console.log(`PlayBimboo API ready; node=${process.version}; platform=${process.platform}; pid=${process.pid}`);
});
server.on('error', (err) => {
  console.error('[LISTEN ERROR]', err);
  process.exit(1);
});
module.exports = app;
