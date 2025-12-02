import * as path from 'path';
import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
  HttpStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface SfAiStackProps extends StackProps {
  readonly environmentName?: string;
  readonly configBucketName?: string;
  readonly modelMapKey?: string;
  readonly allowOrigins?: string[];
  readonly rateLimitQpm?: number;
  readonly burstLimit?: number;
  readonly logRetentionDays?: RetentionDays;
  readonly auditBucketName?: string;
  readonly auditLogPrefix?: string;
}

export class SfAiProdStack extends Stack {
  constructor(scope: Construct, id: string, props?: SfAiStackProps) {
    super(scope, id, props);

    const environmentName = props?.environmentName ?? 'prod';
    const modelMapKey = props?.modelMapKey ?? 'config/model_map.json';
    const allowOrigins = props?.allowOrigins ?? ['https://app.cursor.sh'];
    const rateLimitQpm = props?.rateLimitQpm ?? 60;
    const burstLimit = props?.burstLimit ?? 100;
    const logRetention = props?.logRetentionDays ?? RetentionDays.TWO_WEEKS;
    const auditLogPrefix = props?.auditLogPrefix ?? 'audit';

    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      bucketName: props?.configBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const auditBucket = new s3.Bucket(this, 'AuditLogBucket', {
      bucketName: props?.auditBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const openAiSecret = new secretsmanager.Secret(this, 'OpenAiApiKey', {
      secretName: `/sfai/${environmentName}/OPENAI_API_KEY`,
      description: `OpenAI API key for ${environmentName} environment`,
    });

    const anthropicSecret = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: `/sfai/${environmentName}/ANTHROPIC_API_KEY`,
      description: `Anthropic API key for ${environmentName} environment`,
    });

    const logGroup = new LogGroup(this, 'ChatLambdaLogGroup', {
      retention: logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const chatLambda = new NodejsFunction(this, 'ChatCompletionsFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'chat-completions.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.X86_64,
      memorySize: 512,
      timeout: Duration.seconds(900), // 15 minutes (max for Lambda Function URL)
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        S3_BUCKET_NAME: configBucket.bucketName,
        MODEL_MAP_KEY: modelMapKey,
        OPENAI_SECRET_NAME: openAiSecret.secretName,
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        ALLOW_ORIGINS: allowOrigins.join(','),
        RATE_LIMIT_QPM: rateLimitQpm.toString(),
        LOG_MASK_PII: 'false',
        AUDIT_LOG_BUCKET_NAME: auditBucket.bucketName,
        AUDIT_LOG_PREFIX: auditLogPrefix,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        // Note: aws-lambda is available in Lambda runtime, so we don't need to bundle it
        // However, we need to use require() at runtime to access streamifyResponse
      },
      logGroup,
    });

    configBucket.grantRead(chatLambda, modelMapKey);
    openAiSecret.grantRead(chatLambda);
    anthropicSecret.grantRead(chatLambda);
    auditBucket.grantWrite(chatLambda);

    chatLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    const httpApi = new HttpApi(this, 'ChatCompletionsApi', {
      apiName: `sfai-${environmentName}-chat`,
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowOrigins,
        maxAge: Duration.hours(1),
      },
    });

    const chatIntegration = new HttpLambdaIntegration(
      'ChatCompletionsIntegration',
      chatLambda,
    );

    httpApi.addRoutes({
      path: '/chat/completions',
      methods: [HttpMethod.POST],
      integration: chatIntegration,
    });

    const averageRatePerSecond = Math.max(rateLimitQpm / 60, 1);

    const stage = new HttpStage(this, 'ProdStage', {
      httpApi,
      stageName: environmentName,
      autoDeploy: true,
      throttle: {
        rateLimit: averageRatePerSecond,
        burstLimit,
      },
    });

    new CfnOutput(this, 'ConfigBucketName', {
      value: configBucket.bucketName,
    });

    new CfnOutput(this, 'AuditLogBucketName', {
      value: auditBucket.bucketName,
    });

    new CfnOutput(this, 'ChatApiEndpoint', {
      value: `${httpApi.apiEndpoint}/${stage.stageName}`,
      description: 'API Gateway endpoint',
    });

    new CfnOutput(this, 'ChatLambdaName', {
      value: chatLambda.functionName,
    });

    // Note: InvokeMode is set to RESPONSE_STREAM via AWS CLI for streaming support (SSE)
    // This is required because CDK 2.215.0 doesn't support invokeMode parameter yet
    // To update: aws lambda update-function-url-config --function-name <function-name> --invoke-mode RESPONSE_STREAM
    const functionUrl = chatLambda.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    new CfnOutput(this, 'ChatFunctionUrl', {
      value: functionUrl.url,
      description: 'Lambda Function URL endpoint',
    });
  }
}
