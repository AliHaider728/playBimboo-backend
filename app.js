'use strict';

require('dotenv/config');

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

const app = require('./dist/server.js');

const rawPort = process.env.PORT || '5000';
const parsedPort = Number.parseInt(rawPort, 10);
const port = (!Number.isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) ? parsedPort : rawPort;

app.listen(port, () => {
  console.log(`PlayBimboo API listening on ${port}`);
});

module.exports = app;
