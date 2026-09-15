try {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
} catch (e) {}
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { connectDynamo } = require('../config/dynamo');
const {
  createUser,
  getUserByEmail,
  getUserByMobile,
  listUsersByRole,
  updateUser,
} = require('../services/dynamoService');
const { normalizeMobileToE164 } = require('../utils/phone');

async function seedSuperadminIfMissing({ verbose = true } = {}) {
  await connectDynamo();

  const email = String(process.env.SUPERADMIN_EMAIL || 'superadmin@silvercoin.com').trim().toLowerCase();
  const rawMobile = String(process.env.SUPERADMIN_MOBILE || '9312354769').trim();
  const normalizedMobile = normalizeMobileToE164(rawMobile);
  if (!normalizedMobile.ok) {
    throw new Error(`Invalid SUPERADMIN_MOBILE: ${rawMobile}`);
  }
  const newMobileE164 = normalizedMobile.e164; // e.g. "+919312354769"

  // 1. Look for existing superadmin by email, role, or old phone numbers
  let existing = await getUserByEmail(email);

  if (!existing) {
    const superadmins = await listUsersByRole('superadmin');
    if (superadmins && superadmins.length > 0) {
      existing = superadmins[0];
    }
  }

  if (!existing) {
    const oldMobileNorm = normalizeMobileToE164('7078813158');
    if (oldMobileNorm.ok) {
      const userWithOldMobile = await getUserByMobile(oldMobileNorm.e164);
      if (userWithOldMobile && userWithOldMobile.role === 'superadmin') {
        existing = userWithOldMobile;
      }
    }
  }

  if (existing) {
    const updates = {};
    if (existing.mobile !== newMobileE164) {
      updates.mobile = newMobileE164;
    }
    if (process.env.SUPERADMIN_PASSWORD) {
      const isMatch = await bcrypt.compare(process.env.SUPERADMIN_PASSWORD, existing.passwordHash || '');
      if (!isMatch) {
        updates.passwordHash = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 12);
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateUser(existing.userId, updates);
      if (verbose) console.log(`✅ Updated SuperAdmin (${existing.email || email}):`, updates);
      return { created: false, updated: true, email: existing.email || email, mobile: newMobileE164 };
    }

    if (verbose) console.log('SuperAdmin already exists with up-to-date mobile:', existing.email || email, newMobileE164);
    return { created: false, updated: false, email: existing.email || email, mobile: newMobileE164 };
  }

  // 2. Create new SuperAdmin if missing
  const password = process.env.SUPERADMIN_PASSWORD || '123456789';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    userId: uuidv4(),
    name: process.env.SUPERADMIN_NAME || 'SuperAdmin',
    email,
    mobile: newMobileE164,
    passwordHash,
    role: 'superadmin',
    isFirstLogin: false,
    isActive: true,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
  };

  await createUser(user);
  if (verbose) console.log('✅ SuperAdmin created:', email, newMobileE164);
  return { created: true, email, mobile: newMobileE164 };
}

async function main() {
  await seedSuperadminIfMissing();
  process.exit(0);
}

module.exports = { seedSuperadminIfMissing };

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

