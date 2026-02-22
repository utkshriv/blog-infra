import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Construct } from 'constructs';

export interface BackendStackProps extends cdk.StackProps {
  blogTable: dynamodb.Table;
  playbookTable: dynamodb.Table;
  contentBucket: s3.Bucket;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { blogTable, playbookTable, contentBucket } = props;

    // ── Admin Lambda ─────────────────────────────────────────────────────────
    // CDK bundles blog-backend via Docker at synth/deploy time:
    //   1. pip installs prod deps into /asset-output
    //   2. copies src/admin + src/shared into /asset-output
    // Prerequisites: SSM parameters /botthef/admin-email and /botthef/nextauth-secret
    // must exist in the target account before deploying.
    const adminLambda = new lambda.Function(this, 'AdminLambda', {
      functionName: 'botthef-admin-api',
      runtime: lambda.Runtime.PYTHON_3_12,
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromAsset(path.join(__dirname, '../../blog-backend'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          // Force x86_64 Linux so native extensions (pydantic_core, cryptography)
          // are compiled for the Lambda execution environment, not the build host.
          platform: 'linux/amd64',
          command: [
            'bash', '-c',
            [
              'pip install fastapi mangum boto3 "python-jose[cryptography]" pydantic -t /asset-output',
              'cp -r src/admin src/shared /asset-output/',
            ].join(' && '),
          ],
        },
      }),
      handler: 'admin.handler.handler',
      environment: {
        DYNAMODB_BLOG_TABLE: blogTable.tableName,
        DYNAMODB_PLAYBOOK_TABLE: playbookTable.tableName,
        S3_BUCKET: contentBucket.bucketName,
        ENV: 'production',
        ADMIN_EMAIL: ssm.StringParameter.valueForStringParameter(this, '/botthef/admin-email'),
        NEXTAUTH_SECRET: ssm.StringParameter.valueForStringParameter(this, '/botthef/nextauth-secret'),
        MCP_API_KEY: ssm.StringParameter.valueForStringParameter(this, '/botthef/mcp-api-key'),
      },
    });

    // Grant read/write on both tables (CDK automatically adds GSI ARNs)
    blogTable.grantReadWriteData(adminLambda);
    playbookTable.grantReadWriteData(adminLambda);

    // Grant PutObject for pre-signed URL generation
    contentBucket.grantPut(adminLambda);

    // ── HTTP API Gateway ──────────────────────────────────────────────────────
    const adminIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'AdminIntegration',
      adminLambda
    );

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'botthef-api',
      corsPreflight: {
        allowMethods: [
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [
          'https://www.botthef.xyz',
          'https://botthef.xyz',
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Blog write routes
    httpApi.addRoutes({ path: '/api/blog', methods: [apigwv2.HttpMethod.POST], integration: adminIntegration });
    httpApi.addRoutes({ path: '/api/blog/{slug}', methods: [apigwv2.HttpMethod.PUT], integration: adminIntegration });
    httpApi.addRoutes({ path: '/api/blog/{slug}', methods: [apigwv2.HttpMethod.DELETE], integration: adminIntegration });

    // Playbook write routes
    httpApi.addRoutes({ path: '/api/playbook', methods: [apigwv2.HttpMethod.POST], integration: adminIntegration });
    httpApi.addRoutes({ path: '/api/playbook/{slug}', methods: [apigwv2.HttpMethod.PUT], integration: adminIntegration });
    httpApi.addRoutes({ path: '/api/playbook/{slug}', methods: [apigwv2.HttpMethod.DELETE], integration: adminIntegration });

    // Upload pre-signed URL generation
    httpApi.addRoutes({ path: '/api/upload-url', methods: [apigwv2.HttpMethod.POST], integration: adminIntegration });

    // LeetCode stats sync (triggered by MCP server or local cron)
    httpApi.addRoutes({ path: '/api/leetcode/sync', methods: [apigwv2.HttpMethod.POST], integration: adminIntegration });

    // ── Vercel IAM User (frontend read-only access) ───────────────────────────
    const vercelUser = new iam.User(this, 'VercelFrontendUser', {
      userName: 'botthef-vercel-frontend',
    });

    // DynamoDB read-only on both tables (CDK adds GSI ARNs automatically)
    blogTable.grantReadData(vercelUser);
    playbookTable.grantReadData(vercelUser);

    // S3 read-only on images/ only (not the whole bucket)
    vercelUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3ReadImages',
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [contentBucket.arnForObjects('images/*')],
      })
    );

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      exportName: 'ApiGatewayUrl',
    });

    new cdk.CfnOutput(this, 'AdminLambdaArn', {
      value: adminLambda.functionArn,
      exportName: 'AdminLambdaArn',
    });

    new cdk.CfnOutput(this, 'VercelIamUsername', {
      value: vercelUser.userName,
      exportName: 'VercelIamUsername',
      description: 'Create access keys manually in AWS Console for this user',
    });
  }
}
