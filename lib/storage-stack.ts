import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly contentBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: 'botthef-content-bucket',
      // ACLs not used — access via bucket policy only
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        // Must be false to allow the public GetObject bucket policy below
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: [
            'https://www.botthef.xyz',
            'https://botthef.xyz',
          ],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // Public read for all objects under images/ (served directly to browsers)
    this.contentBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'PublicReadImages',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [this.contentBucket.arnForObjects('images/*')],
      })
    );

    // ── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      exportName: 'ContentBucketName',
    });

    new cdk.CfnOutput(this, 'ContentBucketArn', {
      value: this.contentBucket.bucketArn,
      exportName: 'ContentBucketArn',
    });
  }
}
