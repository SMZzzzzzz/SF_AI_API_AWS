import * as path from 'path';
import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
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

    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      bucketName: props?.configBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
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
      timeout: Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        S3_BUCKET_NAME: configBucket.bucketName,
        MODEL_MAP_KEY: modelMapKey,
        OPENAI_SECRET_NAME: openAiSecret.secretName,
        ANTHROPIC_SECRET_NAME: anthropicSecret.secretName,
        ALLOW_ORIGINS: allowOrigins.join(','),
        RATE_LIMIT_QPM: rateLimitQpm.toString(),
        LOG_MASK_PII: 'false',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
      },
      logGroup,
    });

    configBucket.grantRead(chatLambda, modelMapKey);
    openAiSecret.grantRead(chatLambda);
    anthropicSecret.grantRead(chatLambda);

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

    new CfnOutput(this, 'ChatApiEndpoint', {
      value: `${httpApi.apiEndpoint}/${stage.stageName}`,
    });

    new CfnOutput(this, 'ChatLambdaName', {
      value: chatLambda.functionName,
    });
  }
}
