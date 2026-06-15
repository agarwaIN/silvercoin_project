if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const { connectDynamo, tableName, isLocalDynamo } = require('./config/dynamo');
const { PRODUCTION_PUBLIC_ORIGIN } = require('./config/app');
const { patchRouter } = require('./middleware/patchAsyncRoutes');

const authRoutes = patchRouter(require('./routes/auth'));
const superadminRoutes = patchRouter(require('./routes/superadmin'));
const adminRoutes = patchRouter(require('./routes/admin'));
const employeeRoutes = patchRouter(require('./routes/employee'));
const filesRoutes = patchRouter(require('./routes/files'));

const OPENAPI_PATH = path.join(__dirname, '..', 'openapi.yaml');

function loadOpenApiSpec() {
  const raw = fs.readFileSync(OPENAPI_PATH, 'utf8');
  return yaml.load(raw);
}

const swaggerDocument = loadOpenApiSpec();
const PORT = parseInt(process.env.PORT, 10) || 5000;

function swaggerPublicBase() {
  if (process.env.NODE_ENV === 'production') {
    const origin = PRODUCTION_PUBLIC_ORIGIN.replace(/\/+$/, '');
    if (origin) return origin;
  }
  return `http://localhost:${PORT}`;
}

const publicBase = swaggerPublicBase().replace(/\/$/, '');
swaggerDocument.servers = [
  { url: publicBase, description: 'This server (Try it out)' },
  ...(Array.isArray(swaggerDocument.servers) ? swaggerDocument.servers : []),
];

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Silvercoin API</title>
</head>
<body>
  <h1>Silvercoin loan API</h1>
  <ul>
    <li><a href="/api-docs">Swagger UI</a></li>
    <li><a href="/openapi.yaml">openapi.yaml</a></li>
    <li><a href="/health">/health</a></li>
  </ul>
</body>
</html>`);
});

app.get('/openapi.yaml', (req, res) => {
  res.type('application/yaml');
  res.sendFile(path.resolve(OPENAPI_PATH));
});

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'Silvercoin API — Swagger',
    customCss: '.swagger-ui .topbar { display: none }',
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/files', filesRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ResourceNotFoundException') {
    return res.status(503).json({
      message: 'Database not ready. Ensure local DB is running, then restart the backend.',
    });
  }
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

const HOST = process.env.HOST || '0.0.0.0';
let server;

function shutdown(signal) {
  console.log(`\n${signal}: shutting down…`);
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

async function start() {
  try {
    await connectDynamo();
    if (isLocalDynamo()) {
      const { ensureAllTables } = require('./scripts/ensure-dynamo-tables');
      const { seedSuperadminIfMissing } = require('./scripts/seed-superadmin');
      await ensureAllTables({ verbose: false });
      await seedSuperadminIfMissing({ verbose: false });
    }
    console.log('Tables:', [
      tableName('users'),
      tableName('loans'),
      tableName('emis'),
      tableName('counters'),
      tableName('otpSessions'),
    ].join(', '));
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }

  server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
