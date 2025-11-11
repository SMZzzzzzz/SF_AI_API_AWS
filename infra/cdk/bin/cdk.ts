#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SfAiProdStack } from '../lib/cdk-stack';

const app = new cdk.App();

const environmentName =
  app.node.tryGetContext('environmentName') ?? process.env.SFAI_ENV ?? 'prod';
const configBucketName = app.node.tryGetContext('configBucketName');
const allowOriginsContext = app.node.tryGetContext('allowOrigins');
const allowOrigins = Array.isArray(allowOriginsContext)
  ? allowOriginsContext
  : typeof allowOriginsContext === 'string'
    ? allowOriginsContext.split(',').map((origin) => origin.trim())
    : undefined;

new SfAiProdStack(app, 'SfAiProdStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
  environmentName,
  configBucketName: configBucketName ?? process.env.SFAI_CONFIG_BUCKET,
  allowOrigins,
});
