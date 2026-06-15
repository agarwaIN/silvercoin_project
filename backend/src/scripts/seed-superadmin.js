require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { connectDynamo } = require('../config/dynamo');
const { createUser, getUserByEmail } = require('../services/dynamoService');

async function seedSuperadminIfMissing({ verbose = true } = {}) {
  await connectDynamo();

  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Set SUPERADMIN_EMAIL in .env');
  }
  const existing = await getUserByEmail(email);
  if (existing) {
    if (verbose) console.log('SuperAdmin already exists:', email);
    return { created: false, email };
  }

  const passwordHash = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 12);
  const user = {
    userId: uuidv4(),
    name: process.env.SUPERADMIN_NAME,
    email,
    mobile: process.env.SUPERADMIN_MOBILE,
    passwordHash,
    role: 'superadmin',
    isFirstLogin: false,
    isActive: true,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  };

  await createUser(user);
  if (verbose) console.log('✅ SuperAdmin created:', email);
  return { created: true, email };
}

async function main() {
  await seedSuperadminIfMissing();
  process.exit(0);
}

module.exports = { seedSuperadminIfMissing };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
