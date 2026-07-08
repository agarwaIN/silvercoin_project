'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const dynalite = require('dynalite');

const port = parseInt(process.env.DYNAMODB_LOCAL_PORT, 10) || 8001;
const host = '127.0.0.1';

const path = require('path');
const dataPath = path.join(__dirname, '../../../.dynalite-data');

const server = dynalite({ createTableMs: 0, path: dataPath }).listen(port, host, () => {
  console.log(`Local DynamoDB listening on http://${host}:${port} (dynalite)`);
  console.log(`Persistent storage enabled: saving data to ${dataPath}`);
  console.log('.env should have: DYNAMODB_ENDPOINT=http://127.0.0.1:' + port);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Local DynamoDB already running on http://${host}:${port} — nothing to start.`);
    console.log('Use that terminal, or stop it first: kill -9 $(lsof -ti :' + port + ')');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
