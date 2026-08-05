'use strict';
const path = require('path');
const { config } = require('dotenv');
config({ path: path.join(__dirname, '../../.env') });

const dynalite = require('dynalite');

const port = parseInt(process.env.DYNAMODB_LOCAL_PORT, 10) || 8001;
const host = '127.0.0.1';
const dataPath = path.join(__dirname, '../../../.dynalite-data');

function startLocalDynamo() {
  return new Promise((resolve, reject) => {
    const server = dynalite({ createTableMs: 0, path: dataPath }).listen(port, host, () => {
      console.log(`Local DynamoDB listening on http://${host}:${port} (dynalite)`);
      console.log(`Persistent storage enabled: saving data to ${dataPath}`);
      resolve({ server, host, port, url: `http://${host}:${port}` });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Local DynamoDB already running on http://${host}:${port} — nothing to start.`);
        resolve({ server, host, port, url: `http://${host}:${port}` });
        return;
      }
      reject(err);
    });

    if (require.main === module) {
      const shutdown = () => {
        server.close(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }
  });
}

if (require.main === module) {
  startLocalDynamo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  startLocalDynamo,
};
