'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');
const { tableName, TABLE_DEFAULTS, getDynamoClientOptions } = require('../config/dynamo');

const client = new DynamoDBClient(getDynamoClientOptions());

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function ensureAllTables({ verbose = true } = {}) {
  const billing = { BillingMode: 'PAY_PER_REQUEST' };
  const log = verbose ? console.log.bind(console) : () => {};

  async function ensure(name, params) {
    if (await tableExists(name)) {
      log(`Table exists: ${name}`);
      return;
    }
    await client.send(new CreateTableCommand({ TableName: name, ...params }));
    log(`Created table: ${name}`);
  }

  await ensure(tableName('users'), {
    ...billing,
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'mobile', AttributeType: 'S' },
      { AttributeName: 'role', AttributeType: 'S' },
      { AttributeName: 'createdBy', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'mobile-index',
        KeySchema: [{ AttributeName: 'mobile', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'role-index',
        KeySchema: [{ AttributeName: 'role', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'createdBy-index',
        KeySchema: [{ AttributeName: 'createdBy', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });

  await ensure(tableName('loans'), {
    ...billing,
    AttributeDefinitions: [
      { AttributeName: 'loanId', AttributeType: 'S' },
      { AttributeName: 'employeeId', AttributeType: 'S' },
      { AttributeName: 'adminId', AttributeType: 'S' },
      { AttributeName: 'recoveryAgentId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'loanId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'employeeId-index',
        KeySchema: [{ AttributeName: 'employeeId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'adminId-index',
        KeySchema: [{ AttributeName: 'adminId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'recoveryAgentId-index',
        KeySchema: [{ AttributeName: 'recoveryAgentId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });

  await ensure(tableName('emis'), {
    ...billing,
    AttributeDefinitions: [
      { AttributeName: 'paymentId', AttributeType: 'S' },
      { AttributeName: 'loanId', AttributeType: 'S' },
      { AttributeName: 'dueDate', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'paymentId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'loanId-index',
        KeySchema: [
          { AttributeName: 'loanId', KeyType: 'HASH' },
          { AttributeName: 'dueDate', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });

  await ensure(tableName('counters'), {
    ...billing,
    AttributeDefinitions: [{ AttributeName: 'key', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'key', KeyType: 'HASH' }],
  });

  await ensure(tableName('otpSessions'), {
    ...billing,
    AttributeDefinitions: [{ AttributeName: 'sessionId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'sessionId', KeyType: 'HASH' }],
  });

  log('DynamoDB tables ready:', Object.values(TABLE_DEFAULTS).join(', '));
}

async function main() {
  await ensureAllTables();
  process.exit(0);
}

module.exports = { ensureAllTables };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
