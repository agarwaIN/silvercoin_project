const {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, tableName } = require('../config/dynamo');

async function scanAll(TableName, extra = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(new ScanCommand({
      TableName,
      ...extra,
      ExclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(new QueryCommand({
      ...params,
      ExclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function buildUpdateExpr(updates) {
  const names = {};
  const values = {};
  const parts = [];
  let i = 0;
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    const nk = `#k${i}`;
    const vk = `:v${i}`;
    names[nk] = k;
    values[vk] = v;
    parts.push(`${nk} = ${vk}`);
    i += 1;
  }
  if (!parts.length) {
    return null;
  }
  return {
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

async function getUserById(userId) {
  const result = await docClient.send(new GetCommand({
    TableName: tableName('users'),
    Key: { userId },
  }));
  return result.Item || null;
}

async function getUserByEmail(email) {
  const items = await queryAll({
    TableName: tableName('users'),
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  });
  return items[0] || null;
}

async function getUserByMobile(mobile) {
  const items = await queryAll({
    TableName: tableName('users'),
    IndexName: 'mobile-index',
    KeyConditionExpression: 'mobile = :mobile',
    ExpressionAttributeValues: { ':mobile': mobile },
  });
  return items[0] || null;
}

async function createUser(user) {
  await docClient.send(new PutCommand({
    TableName: tableName('users'),
    Item: user,
    ConditionExpression: 'attribute_not_exists(userId)',
  }));
  return user;
}

async function deleteUser(userId) {
  await docClient.send(new DeleteCommand({
    TableName: tableName('users'),
    Key: { userId },
  }));
}

async function updateUser(userId, updates) {
  const expr = buildUpdateExpr(updates);
  if (!expr) return;
  await docClient.send(new UpdateCommand({
    TableName: tableName('users'),
    Key: { userId },
    ...expr,
  }));
}

async function listUsersByRole(role) {
  return queryAll({
    TableName: tableName('users'),
    IndexName: 'role-index',
    KeyConditionExpression: '#role = :role',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: { ':role': role },
  });
}

async function listUsersByCreator(createdBy) {
  return queryAll({
    TableName: tableName('users'),
    IndexName: 'createdBy-index',
    KeyConditionExpression: 'createdBy = :createdBy',
    ExpressionAttributeValues: { ':createdBy': createdBy },
  });
}

async function listAllUsers() {
  return scanAll(tableName('users'));
}

async function getNextSeq(counterKey) {
  const result = await docClient.send(new UpdateCommand({
    TableName: tableName('counters'),
    Key: { key: counterKey },
    UpdateExpression: 'SET #seq = if_not_exists(#seq, :zero) + :inc',
    ExpressionAttributeNames: { '#seq': 'seq' },
    ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
    ReturnValues: 'UPDATED_NEW',
  }));
  return result.Attributes.seq;
}

async function getNextLoanSeq(date) {
  return getNextSeq(date);
}

async function getNextRegistryTagSeq(seqKey) {
  return getNextSeq(seqKey);
}

async function deleteAllCounters() {
  const items = await scanAll(tableName('counters'));
  let deleted = 0;
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName('counters')]: batch.map((item) => ({
          DeleteRequest: { Key: { key: item.key } },
        })),
      },
    }));
    deleted += batch.length;
  }
  return deleted;
}

async function setLoanRegistryTagIfAbsent(loanId, registryTag) {
  const now = new Date().toISOString();
  try {
    await docClient.send(new UpdateCommand({
      TableName: tableName('loans'),
      Key: { loanId },
      UpdateExpression: 'SET registryTag = :tag, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(registryTag) OR registryTag = :empty',
      ExpressionAttributeValues: {
        ':tag': registryTag,
        ':now': now,
        ':empty': '',
      },
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      const e = new Error('Registry tag already set');
      e.name = 'ConditionalCheckFailedException';
      throw e;
    }
    throw err;
  }
}

async function getLoanById(loanId) {
  const result = await docClient.send(new GetCommand({
    TableName: tableName('loans'),
    Key: { loanId },
  }));
  return result.Item || null;
}

async function createLoan(loan) {
  await docClient.send(new PutCommand({
    TableName: tableName('loans'),
    Item: loan,
    ConditionExpression: 'attribute_not_exists(loanId)',
  }));
  return loan;
}

async function deleteLoan(loanId) {
  await docClient.send(new DeleteCommand({
    TableName: tableName('loans'),
    Key: { loanId },
  }));
}

async function updateLoan(loanId, updates) {
  const now = new Date().toISOString();
  const expr = buildUpdateExpr({ ...updates, updatedAt: now });
  if (!expr) return;
  await docClient.send(new UpdateCommand({
    TableName: tableName('loans'),
    Key: { loanId },
    ...expr,
  }));
}

async function listLoansByEmployee(employeeId) {
  return queryAll({
    TableName: tableName('loans'),
    IndexName: 'employeeId-index',
    KeyConditionExpression: 'employeeId = :employeeId',
    ExpressionAttributeValues: { ':employeeId': employeeId },
  });
}

async function listLoansByAdmin(adminId) {
  return queryAll({
    TableName: tableName('loans'),
    IndexName: 'adminId-index',
    KeyConditionExpression: 'adminId = :adminId',
    ExpressionAttributeValues: { ':adminId': adminId },
  });
}

async function listAllLoans() {
  return scanAll(tableName('loans'));
}

async function createEmiPayment(payment) {
  await docClient.send(new PutCommand({
    TableName: tableName('emis'),
    Item: payment,
    ConditionExpression: 'attribute_not_exists(paymentId)',
  }));
}

async function deleteEmiPayment(paymentId) {
  await docClient.send(new DeleteCommand({
    TableName: tableName('emis'),
    Key: { paymentId },
  }));
}

async function listEmiByLoan(loanId) {
  const items = await queryAll({
    TableName: tableName('emis'),
    IndexName: 'loanId-index',
    KeyConditionExpression: 'loanId = :loanId',
    ExpressionAttributeValues: { ':loanId': loanId },
  });
  return items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

async function updateEmiPayment(paymentId, updates) {
  const expr = buildUpdateExpr(updates);
  if (!expr) return;
  await docClient.send(new UpdateCommand({
    TableName: tableName('emis'),
    Key: { paymentId },
    ...expr,
  }));
}

async function createOtpSession(session) {
  await docClient.send(new PutCommand({
    TableName: tableName('otpSessions'),
    Item: session,
  }));
}

async function getOtpSession(sessionId) {
  const result = await docClient.send(new GetCommand({
    TableName: tableName('otpSessions'),
    Key: { sessionId },
  }));
  return result.Item || null;
}

async function updateOtpSession(sessionId, updates) {
  const expr = buildUpdateExpr(updates);
  if (!expr) return;
  await docClient.send(new UpdateCommand({
    TableName: tableName('otpSessions'),
    Key: { sessionId },
    ...expr,
  }));
}

async function deleteOtpSession(sessionId) {
  await docClient.send(new DeleteCommand({
    TableName: tableName('otpSessions'),
    Key: { sessionId },
  }));
}

module.exports = {
  getUserById,
  getUserByEmail,
  getUserByMobile,
  createUser,
  deleteUser,
  updateUser,
  listUsersByRole,
  listUsersByCreator,
  listAllUsers,
  getNextLoanSeq,
  getNextRegistryTagSeq,
  setLoanRegistryTagIfAbsent,
  deleteAllCounters,
  getLoanById,
  createLoan,
  updateLoan,
  deleteLoan,
  listLoansByEmployee,
  listLoansByAdmin,
  listAllLoans,
  createEmiPayment,
  listEmiByLoan,
  updateEmiPayment,
  deleteEmiPayment,
  createOtpSession,
  getOtpSession,
  updateOtpSession,
  deleteOtpSession,
};
