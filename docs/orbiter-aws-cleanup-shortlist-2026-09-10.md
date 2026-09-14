# Orbiter AWS 剩余资源清理清单

> 更新日期：2026-09-10
> AWS 账号：`952178321851`
> 清理范围：Orbiter 及历史遗留资源；**Token Boat 资源不删除**。

## 一、优先清理

| 资源 | 待清理内容 | 操作入口 |
|---|---|---|
| 空闲 EBS | 10 块 `orbiter-finance` 空闲卷，共 353 GiB | [打开 EBS Volumes](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Volumes:) |
| 旧 Orbiter VPC | `vpc-02dcfef555a661b85`；包含 4 个 Endpoint、1 个 NAT、1 个 EIP、2 个 Subnet | [打开 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:VpcId=vpc-02dcfef555a661b85) |
| VPC Endpoint | `vpce-0586074c7f4ee29f3`、`vpce-0cafe433e9609c156`、`vpce-0bb393d5d9934d88c`、`vpce-0cab1c803423f3e41` | [打开 VPC Endpoint](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#Endpoints:) |
| NAT / EIP | `nat-0479f334dd0b10353`；`3.114.234.192` / `eipalloc-0048815714c5a6960` | [NAT Gateway](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#NatGateways:) · [Elastic IP](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Addresses:) |
| 旧负载均衡 | NLB `a80bc00be375e4636977fc4dd30bd81d`、Classic ELB `aab466a1dfb7e4f0084d2038698bf152`、ALB `k8s` | [打开 Load Balancers](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:) |
| Loki 日志 Bucket | `eks-loki-obt`，约 653 GB | [打开 Bucket](https://s3.console.aws.amazon.com/s3/buckets/eks-loki-obt?region=ap-northeast-1&tab=objects) |

VPC 删除顺序：Endpoint → NAT → EIP → Subnet/路由/IGW/安全组 → VPC。

## 二、网站和 CDN 下线

这些网站目前仍可访问，需先确认正式停服，再删除。

| 资源 | 待清理内容 | 操作入口 |
|---|---|---|
| Orbiter 前端 | Amplify `ddwthojoyyc8q` / `OrbiterBridgeFe 2.0` | [打开 Amplify App](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/ddwthojoyyc8q/overview?region=ap-northeast-1) |
| NBnB 前端 | Amplify `dwsg5kf6g2mtj` / `nbnb.io` | [打开 Amplify App](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dwsg5kf6g2mtj/overview?region=ap-northeast-1) |
| Orbiter CDN | CloudFront `E2DPRCY9PR6N5J` / `cdn.orbiter.finance` | [打开 CloudFront](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E2DPRCY9PR6N5J) |
| CDN 源站 | S3 `orbiter-bridge` | [打开 Bucket](https://s3.console.aws.amazon.com/s3/buckets/orbiter-bridge?region=ap-northeast-1&tab=objects) |
| Orbiter DNS | `orbiter.finance`，54 条记录 | [打开 Hosted Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z04770142853ETHC27F9J) |
| 旧 K8s DNS | `orbk8s.com`，8 条记录 | [打开 Hosted Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z01909693VMTQ0S20M3Y5) |
| NBnB DNS | `nbnb.io`，9 条记录 | [打开 Hosted Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z04660193H7FQ7GTLXEUC) |

注意：`orbiter.finance` 和 `nbnb.io` 存在邮件记录；邮箱仍使用时保留 MX、SPF、DKIM。

## 三、备份和历史数据

| 资源 | 待清理内容 | 操作入口 |
|---|---|---|
| EBS Snapshot | 69 个 `orbiter-finance` 快照 | [打开 EBS Snapshots](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Snapshots:) |
| Velero Backup | S3 `orbiter-velero-backups-tokyo` | [打开 Bucket](https://s3.console.aws.amazon.com/s3/buckets/orbiter-velero-backups-tokyo?region=ap-northeast-1&tab=objects) |
| Official Bridge 数据库备份 | RDS Snapshot `official-bridge-server-snapshot` | [打开 RDS Snapshots](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#snapshots-list:) |
| Redshift 备份 | `orbiter-redshift-final-snapshot` | [打开 Redshift Snapshots](https://ap-northeast-1.console.aws.amazon.com/redshiftv2/home?region=ap-northeast-1#snapshots) |
| 旧 EC2 Rescue 备份 | AMI `ami-05fff1bf79d2bb753` 及 Snapshot `snap-0a626798dc5d20008` | [AMI](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Images:visibility=owned-by-me) · [Snapshots](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Snapshots:) |

以上资源确认不再需要恢复后再删除。

## 四、历史应用和外围资源

| 资源 | 待清理内容 | 操作入口 |
|---|---|---|
| DynamoDB | 9 张 2020–2021 年历史表 | [打开 DynamoDB](https://ap-northeast-1.console.aws.amazon.com/dynamodbv2/home?region=ap-northeast-1#tables) |
| CloudFormation | 21 个历史业务 Stack，以及旧 EKS Velero Stack | [打开 CloudFormation](https://ap-northeast-1.console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks) |
| Cognito | 8 个旧 Amplify User Pool | [打开 Cognito](https://ap-northeast-1.console.aws.amazon.com/cognito/v2/idp/user-pools?region=ap-northeast-1) |
| IAM / OIDC | 旧 Velero、Jenkins EKS Role，2 个旧 EKS OIDC Provider，1 个旧 Instance Profile | [IAM Roles](https://us-east-1.console.aws.amazon.com/iam/home#/roles) · [Identity Providers](https://us-east-1.console.aws.amazon.com/iam/home#/identity_providers) |
| Security Group | 11 个旧 EKS、ELB、Orbiter VPC 安全组 | [打开 Security Groups](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#SecurityGroups:) |
| WAF | 1 个未关联 Regional WAF、2 个 Orbiter Amplify Global WAF | [东京 WAF](https://ap-northeast-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=ap-northeast-1) · [Global WAF](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=us-east-1) |
| ACM 证书 | 22 张非 Token Boat 证书；先删未使用证书，其余随 LB/CDN 删除 | [东京 ACM](https://ap-northeast-1.console.aws.amazon.com/acm/home?region=ap-northeast-1#/certificates/list) · [Virginia ACM](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates/list) |
| CloudWatch | 旧 DMS/Redshift 日志、25 条历史告警、旧 Dashboard `td` | [Logs](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups) · [Alarms](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#alarmsV2:) |
| SNS | 5 个无订阅的旧 Amplify/DynamoDB Topic | [打开 SNS](https://ap-northeast-1.console.aws.amazon.com/sns/v3/home?region=ap-northeast-1#/topics) |
| ECR | Virginia `aabank-telegram-server` | [打开 Virginia ECR](https://us-east-1.console.aws.amazon.com/ecr/repositories/private/952178321851?region=us-east-1) |
| Secrets Manager | 旧 SQL Workbench Secret | [打开 Secrets Manager](https://ap-northeast-1.console.aws.amazon.com/secretsmanager/listsecrets?region=ap-northeast-1) |

## 五、禁止删除：Token Boat

- EKS `token-boat` 及其 EC2 Node。
- EC2 `token-boat-middleware`。
- RDS `maker-explore` 及 `full-0909`、`maker-explore-0908` 快照。
- ALB `token-boat-public`、`token-boat-public-v2`、`token-boat-agent-api`。
- ECR `token-boat`、`token-boat-agent-api`。
- Amplify `token-boat-api-docs`、`token-boat-agent`。
- Route 53 `tokenboat.com` Hosted Zone及其记录。
- ACM `tokenboat.com` 证书。

## 六、建议审批顺序

1. 确认网站、邮箱和备份保留期限。
2. 删除 Orbiter/NBnB DNS、Amplify 和 CloudFront。
3. 删除旧负载均衡、空闲 EBS 和 Loki S3。
4. 删除旧 VPC 的 Endpoint、NAT、EIP 和 VPC。
5. 删除历史 DynamoDB、CloudFormation、Cognito。
6. 最后清理 IAM、WAF、ACM、CloudWatch、SNS 和安全组。
