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

const DEFAULT_DYNAMODB_HOST = '127.0.0.1';
const DEFAULT_DYNAMODB_PORT = process.env.DYNAMODB_LOCAL_PORT ? parseInt(process.env.DYNAMODB_LOCAL_PORT, 10) : 8001;
const DEFAULT_DYNAMODB_ENDPOINT = `http://${DEFAULT_DYNAMODB_HOST}:${DEFAULT_DYNAMODB_PORT}`;
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT?.trim() || DEFAULT_DYNAMODB_ENDPOINT;

function getDynamoClientOptions() {
  return {
    region: 'local',
    endpoint: DYNAMODB_ENDPOINT,
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  };
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
  return true;
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
