const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_DEFAULTS = {
  users: 'silvercoin-users',
  loans: 'silvercoin-loans',
  emis: 'silvercoin-emi-payments',
  counters: 'silvercoin-counters',
  otpSessions: 'silvercoin-otp-sessions',
};

const TABLE_ENV_KEYS = {
  users: 'DYNAMODB_USERS_TABLE',
  loans: 'DYNAMODB_LOANS_TABLE',
  emis: 'DYNAMODB_EMIS_TABLE',
  counters: 'DYNAMODB_COUNTERS_TABLE',
  otpSessions: 'DYNAMODB_OTP_SESSIONS_TABLE',
};

function getDocumentStoreRegion() {
  const region = process.env.CLOUD_REGION || process.env.REGION;
  if (region) return region;
  if (process.env.DYNAMODB_ENDPOINT?.trim()) return 'local';
  if (process.env.NODE_ENV !== 'production') return 'local';
  throw new Error('CLOUD_REGION is not set in environment');
}

function getDynamoClientOptions() {
  const region = getDocumentStoreRegion();
  const endpoint = process.env.DYNAMODB_ENDPOINT?.trim();
  if (endpoint) {
    return {
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.CLOUD_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'local',
      },
    };
  }
  return { region };
}

const client = new DynamoDBClient(getDynamoClientOptions());

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

function tableName(kind) {
  const envKey = TABLE_ENV_KEYS[kind];
  return process.env[envKey] || TABLE_DEFAULTS[kind];
}

function isLocalDynamo() {
  return Boolean(process.env.DYNAMODB_ENDPOINT?.trim());
}

async function connectDynamo() {
  return docClient;
}

module.exports = {
  docClient,
  dynamoClient: client,
  getDynamoClientOptions,
  tableName,
  connectDynamo,
  isLocalDynamo,
  TABLE_DEFAULTS,
};
