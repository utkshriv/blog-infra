import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDbStack extends cdk.Stack {
  public readonly blogTable: dynamodb.Table;
  public readonly playbookTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Blog Table ──────────────────────────────────────────────────────────
    this.blogTable = new dynamodb.Table(this, 'BlogTable', {
      tableName: 'blog',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: date-index — sort posts by publication date
    // GSI_PK = SK (constant "METADATA" for all blog posts), GSI_SK = date
    this.blogTable.addGlobalSecondaryIndex({
      indexName: 'date-index',
      partitionKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Playbook Table ───────────────────────────────────────────────────────
    // Single-table design: modules (SK=METADATA) and problems (SK=PROBLEM#<id>)
    this.playbookTable = new dynamodb.Table(this, 'PlaybookTable', {
      tableName: 'playbook',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI: status-review-index — query problems due for spaced-repetition review
    this.playbookTable.addGlobalSecondaryIndex({
      indexName: 'status-review-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'nextReview', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI: playbook-collection-gsi — list all modules with their problems
    this.playbookTable.addGlobalSecondaryIndex({
      indexName: 'playbook-collection-gsi',
      partitionKey: { name: 'collection', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BlogTableName', {
      value: this.blogTable.tableName,
      exportName: 'BlogTableName',
    });

    new cdk.CfnOutput(this, 'PlaybookTableName', {
      value: this.playbookTable.tableName,
      exportName: 'PlaybookTableName',
    });
  }
}
