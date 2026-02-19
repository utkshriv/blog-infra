#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { StorageStack } from '../lib/storage-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
};

const dynamoDbStack = new DynamoDbStack(app, 'DynamoDbStack', {
  env,
  terminationProtection: true,
});

const storageStack = new StorageStack(app, 'StorageStack', {
  env,
  terminationProtection: true,
});

const backendStack = new BackendStack(app, 'BackendStack', {
  env,
  terminationProtection: true,
  blogTable: dynamoDbStack.blogTable,
  playbookTable: dynamoDbStack.playbookTable,
  contentBucket: storageStack.contentBucket,
});

backendStack.addDependency(dynamoDbStack);
backendStack.addDependency(storageStack);
