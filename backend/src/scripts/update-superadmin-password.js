require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { connectDynamo } = require('../config/dynamo');
const { getUserByEmail, updateUser } = require('../services/dynamoService');

async function main() {
  await connectDynamo();
  const email = process.env.SUPERADMIN_EMAIL;
  console.log(`Looking up SuperAdmin with email: ${email}`);
  
  const user = await getUserByEmail(email);
  if (!user) {
    console.log('SuperAdmin not found in database!');
    process.exit(1);
  }
  
  console.log(`Found user: ${user.userId}. Updating password hash...`);
  const passwordHash = await bcrypt.hash('123456789', 12);
  await updateUser(user.userId, { passwordHash });
  
  console.log('✅ Successfully updated SuperAdmin password to 123456789 in the database!');
  process.exit(0);
}

main().catch(console.error);
