# Orbiter AWS 下线剩余资源清单

> 复核时间：2026-09-10 20:00（Asia/Shanghai）
> AWS 账号：`952178321851`
> 主要区域：东京 `ap-northeast-1`；已补查账号已启用的其他 Region
> 范围：列出目前仍存在、可随 Orbiter 下线释放的资源；**Token Boat 生产资源明确排除**
> 本文只做现状核对和操作建议，未执行任何 AWS 删除操作。

## 1. 给管理层的结论

`orbiter-finance` EKS 集群、Orbiter EC2、DMS 实例、Redshift 集群、Official Bridge RDS 实例以及大部分 Amplify、CloudFront、ECR、S3 资源已经删除。

目前还没有完成的重点如下：

| 优先级 | 剩余资源 | 当前情况 | 建议 |
|---|---|---|---|
| P0 | 旧 EKS 遗留 EBS | 10 块 `available` 卷，共 353 GiB | 备份确认后删除 |
| P0 | 旧 Orbiter VPC | 1 个 NAT Gateway、4 个 Interface Endpoint、1 个 EIP 仍在计费 | 按依赖顺序完整删除 VPC |
| P0 | 旧负载均衡 | 1 个 NLB、1 个 Classic ELB、1 个旧 ALB | 先清 DNS；再删除 LB |
| P0 | Loki S3 | `eks-loki-obt` 约 653.09 GB、826,646 个对象 | 无新 EKS Loki 工作负载；审计留存确认后删除 |
| P1 | Orbiter 前端 | 2 个非 Token Boat Amplify App 仍在线，访问返回 HTTP 200 | 发布停服通知后删除 |
| P1 | Orbiter CDN | `cdn.orbiter.finance` 仍启用；近 24 小时约 19,493 次请求、下载 1.01 GB | 先断 DNS，再停 CloudFront 和 S3 源站 |
| P1 | EBS 快照 | 69 个 Orbiter 快照；源卷容量合计 1,848 GiB | 确认恢复窗口后批量删除 |
| P1 | 遗留数据备份 | 1 个 Official Bridge RDS 快照、1 个 Redshift 最终快照、1 个旧 EC2 Rescue AMI/快照 | 按保留期删除 |
| P2 | Serverless 遗留 | 9 张 DynamoDB 表、21 个旧业务 CloudFormation Stack、8 个 Cognito User Pool | 数据导出并确认归属后按 Stack 删除 |
| P2 | 安全与外围资源 | 旧 IAM/OIDC、WAF、ACM、CloudWatch、SNS、Security Group、Route 53 记录 | 主资源删除后收尾 |

当前最值得优先处理的是：**353 GiB 空闲 EBS、653 GB Loki S3、旧 VPC 的 NAT/Endpoint、3 个旧负载均衡**。

## 2. 已删除完成的项目

| 服务 | 复核结果 |
|---|---|
| EKS | 只剩 `token-boat`；`orbiter-finance` 已不存在 |
| EC2 | 东京只剩 4 台 Token Boat EKS 节点和 `token-boat-middleware`；无非 Token Boat 运行/停止实例 |
| RDS | 只剩 Token Boat 使用的 `maker-explore`；Official Bridge 等实例已不存在 |
| DMS | Replication Instance、Task、Endpoint 均为空 |
| Redshift | Cluster 列表为空；只剩最终快照 |
| 东京 ECR | 只剩 `token-boat`、`token-boat-agent-api` 两个仓库 |
| Amplify | 已从原 29 个降到 4 个；其中 2 个为 Token Boat，2 个待下线 |
| CloudFront | 原先 4 个已禁用 Distribution 已删除；只剩 `cdn.orbiter.finance` |
| S3 | 当前只剩 3 个 Orbiter/旧 EKS Bucket |
| Launch Template | 只剩 Token Boat EKS Auto Mode 当前模板 |
| 跨区域计算资源 | 除 Virginia 的 1 个旧 ECR Repo 外，其他已启用 Region 未发现 EC2/EBS/RDS/EKS/ELB/DMS |

## 3. P0：可以进入删除审批的资源

### 3.1 旧 EKS 空闲 EBS 卷

[打开东京 EBS Volumes 管理页](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Volumes:)

这些卷全部为 `available`，没有挂载实例；Tag 明确属于已删除的 `orbiter-finance`。

| Volume ID | 容量 | AZ | 原 PVC / 用途 |
|---|---:|---|---|
| `vol-088f5c709e07fcc0f` | 10 GiB | 1a | Alertmanager |
| `vol-099f51ed13a319c81` | 10 GiB | 1c | Grafana |
| `vol-0fcc5fed474f5fa74` | 51 GiB | 1a | `data-loki-backend-0` |
| `vol-02ecfcadfe6faf2e7` | 51 GiB | 1a | `data-loki-write-1` |
| `vol-0511c766020ea29b1` | 10 GiB | 1c | `consul-server-1` |
| `vol-04643e402f7e30762` | 10 GiB | 1a | `consul-server-2` |
| `vol-076ed92b663739455` | 100 GiB | 1a | Prometheus |
| `vol-0b3cccc9677a15379` | 51 GiB | 1c | `data-loki-write-0` |
| `vol-0f48a73346bf14aae` | 50 GiB | 1c | `data-loki-backend-1` |
| `vol-03d259a366f21d461` | 10 GiB | 1a | `consul-server-0` |
| **合计** | **353 GiB** |  |  |

操作建议：如 69 个 EBS Snapshot 或 Velero 备份已满足回滚要求，可一次性删除以上 10 块卷。

### 3.2 空闲 Orbiter VPC

[打开 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:VpcId=vpc-02dcfef555a661b85) · [VPC Endpoint](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#Endpoints:) · [NAT Gateway](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#NatGateways:) · [Elastic IP](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Addresses:)

VPC `vpc-02dcfef555a661b85`（`orbiter`，`10.1.0.0/16`）内没有 EC2、RDS 或负载均衡，只剩 5 个 ENI：4 个 Endpoint ENI 和 1 个 NAT ENI。

| 类型 | 资源 | 状态 |
|---|---|---|
| Interface Endpoint | `vpce-0586074c7f4ee29f3` / SSM | `available` |
| Interface Endpoint | `vpce-0cafe433e9609c156` / EC2 Messages | `available` |
| Interface Endpoint | `vpce-0bb393d5d9934d88c` / SSM Messages | `available` |
| Interface Endpoint | `vpce-0cab1c803423f3e41` / EC2 | `available` |
| NAT Gateway | `nat-0479f334dd0b10353` | ENI 仍存在 |
| EIP | `3.114.234.192` / `eipalloc-0048815714c5a6960` | 关联旧 NAT |
| Public Subnet | `subnet-090225949ba7ca8cc` / `10.1.2.0/24` | 可删除 |
| Private Subnet | `subnet-0807a41551fb73acb` / `10.1.1.0/24` | 可删除 |
| Internet Gateway | `igw-06dfd9dcfd1eacc89` | `makernode-getway` |

建议顺序：

1. 删除 4 个 Interface Endpoint。
2. 删除 `nat-0479f334dd0b10353`，等待状态变为 deleted。
3. 释放 EIP `eipalloc-0048815714c5a6960`。
4. 删除自定义路由表关联、两个 Subnet、IGW 和非 default Security Group。
5. 最后删除 VPC。

### 3.3 遗留负载均衡

[打开东京 Load Balancers](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:)

| 资源 | 现状 | 依赖与操作建议 |
|---|---|---|
| NLB `a80bc00be375e4636977fc4dd30bd81d` | `active`；近 6 小时约 3.16 GB、402,242 个新流；Orbiter HTTPS 探测均超时 | 仍有 DNS 指向它。先删 `api/blog/demo-api/openapi.orbiter.finance` 和 `hello.orbk8s.com`，观察后删除 NLB |
| Classic ELB `aab466a1dfb7e4f0084d2038698bf152` | `active`，但注册实例为 0；近 6 小时仍有约 517 请求 | 先删 `bridge-api`、`router.orbiter.finance` 和 `*.orbk8s.com` 记录，再删除 ELB |
| ALB `k8s` | 近 7 天无 RequestCount；无 Route 53 业务记录指向；位于 default VPC | 可删除。删除后检查 3 个关联 EIP 是否自动释放 |

`k8s` ALB 关联的三个公网地址：

- `13.115.6.254` / `eipalloc-0680bc87f25b1ca2e`
- `13.158.100.104` / `eipalloc-0a37c491a8d1ce293`
- `52.194.85.119` / `eipalloc-0b84548450e209a71`

注意：旧 NLB/Classic ELB 的流量说明互联网上仍有客户端或扫描流量，但它们已经无法正常提供 HTTPS 服务。应先完成 DNS 断流，避免边缘客户端继续重试。

### 3.4 旧 EKS IAM、OIDC 与 CloudFormation

[CloudFormation](https://ap-northeast-1.console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks) · [IAM Roles](https://us-east-1.console.aws.amazon.com/iam/home#/roles) · [IAM Identity Providers](https://us-east-1.console.aws.amazon.com/iam/home#/identity_providers)

建议先删除 CloudFormation Stack `eksctl-orbiter-finance-addon-iamserviceaccount-velero-velero-server`，由 Stack 删除它管理的 Role `eks-velero-backup-role`。

之后清理：

- Role `jenkins-eks-deploy-role-orbiter`，LastUsed 为空。
- Role `jenkins-eks-deploy-role-aabank`，LastUsed 为空。
- OIDC Provider `.../4989BFB71459B7407A9CFD447C4B0F3F`。
- OIDC Provider `.../8B77383207051315412B5DA765133F14`。
- Instance Profile `eks-ap-northeast-1-orbiter-finance-16199223705464438668`。其中的 `AmazonEKSAutoNodeRole` 可能被 Token Boat 共用，**只删 Instance Profile，不要直接删共享 Role**。

## 4. P1：需要先断流或确认数据保留期

### 4.1 Amplify 前端仍在线

[打开 Amplify Apps](https://ap-northeast-1.console.aws.amazon.com/amplify/apps?region=ap-northeast-1)

| App | 线上域名/分支 | 现状 | 操作 |
|---|---|---|---|
| [`ddwthojoyyc8q` / OrbiterBridgeFe 2.0](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/ddwthojoyyc8q/overview?region=ap-northeast-1) | `orbiter.finance`、`app`、`www`、`bridge`、`beta`、`test`、`testnet`、`static`、`dealer`；8 个分支 | 域名访问 HTTP 200；生产分支 2026-08 仍有更新 | 停服公告后解绑域名并删除 App |
| [`dwsg5kf6g2mtj` / nbnb.io](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dwsg5kf6g2mtj/overview?region=ap-northeast-1) | `nbnb.io`、`www.nbnb.io`；`main` 分支 | 当前 HTTP 200 | 确认 NBnB 一并下线后删除 |

删除第一个 App 后，继续删除它的两个 Global WAF Web ACL 和两个 SNS Topic。

### 4.2 CloudFront 和 S3 静态资源

[打开 CloudFront](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions) · [打开 S3](https://s3.console.aws.amazon.com/s3/buckets)

| 资源 | 当前规模/状态 | 建议 |
|---|---|---|
| [CloudFront `E2DPRCY9PR6N5J`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E2DPRCY9PR6N5J) | `cdn.orbiter.finance`，Enabled；近 24 小时 19,493 Requests、约 1.01 GB 下载 | 先删 DNS；再 Disable，等待 Deployed 后 Delete |
| [`orbiter-bridge`](https://s3.console.aws.amazon.com/s3/buckets/orbiter-bridge?region=ap-northeast-1&tab=objects) | 约 0.58 GB，12,636 个对象；为 CDN Origin | CloudFront 删除后清空并删 Bucket |
| [`eks-loki-obt`](https://s3.console.aws.amazon.com/s3/buckets/eks-loki-obt?region=ap-northeast-1&tab=objects) | 约 653.09 GB，826,646 个对象 | 新 Token Boat EKS 没有 Loki 工作负载；审计/日志保留确认后删除 |
| [`orbiter-velero-backups-tokyo`](https://s3.console.aws.amazon.com/s3/buckets/orbiter-velero-backups-tokyo?region=ap-northeast-1&tab=objects) | 约 0.76 GB，1,330 个对象 | 暂作为最后恢复源；Agent API/Token Boat 稳定并通过恢复验收后删除 |

当前账号无其他 S3 Bucket。当前 IAM 无权查看 Bucket Versioning、Lifecycle 和 Encryption；老板删除前需检查历史版本和 Delete Marker，避免只删当前版本后 Bucket 仍无法删除。

### 4.3 EBS、RDS、Redshift 备份

[EBS Snapshots](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Snapshots:) · [RDS Snapshots](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#snapshots-list:) · [Redshift Snapshots](https://ap-northeast-1.console.aws.amazon.com/redshiftv2/home?region=ap-northeast-1#snapshots)

| 类型 | 资源 | 建议 |
|---|---|---|
| EBS Snapshot | 69 个带 `orbiter-finance`/dynamic-pvc 标记的快照；2026-09-02 至 2026-09-10；源卷容量合计 1,848 GiB | 设定 7/14/30 天恢复窗口，过期后按 Tag 批量删除 |
| RDS Snapshot | `official-bridge-server-snapshot`，20 GiB | 确认无需恢复 Official Bridge 后删除 |
| Redshift Snapshot | `orbiter-redshift-final-snapshot`，约 26.8 GB | 审计导出完成后删除 |
| AMI | `ami-05fff1bf79d2bb753`，2023 EC2 Rescue 备份 | 先 Deregister AMI，再删除其 80 GiB Snapshot `snap-0a626798dc5d20008` |

说明：EBS 的 1,848 GiB 是各快照对应源卷容量之和，不等于实际增量计费容量。

Token Boat 的 `full-0909`、`maker-explore-0908` 两个 RDS Snapshot 不在删除范围。

### 4.4 Route 53 下线清单

[打开 Route 53 Hosted Zones](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones)

| Zone | 当前记录数 | 处理建议 |
|---|---:|---|
| [`orbiter.finance` / `Z04770142853ETHC27F9J`](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z04770142853ETHC27F9J) | 54 | 清业务记录；Google Workspace 邮件停用前保留 MX/SPF/DKIM |
| [`orbk8s.com` / `Z01909693VMTQ0S20M3Y5`](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z01909693VMTQ0S20M3Y5) | 8 | Token Boat 已不依赖；旧 LB 删除后可删除 Zone |
| [`nbnb.io` / `Z04660193H7FQ7GTLXEUC`](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z04660193H7FQ7GTLXEUC) | 9 | App 下线后清理；邮件记录需单独确认 |
| `kicktech.ai` / `Z0196311BCOAHF0M661F` | 3 | 归属不明确，老板确认是否属于本次下线 |

应优先删除或修改的业务记录：

- 指向旧 NLB：`api`、`blog`、`demo-api`、`openapi.orbiter.finance`，以及 `hello.orbk8s.com`。
- 指向无实例 Classic ELB：`bridge-api`、`router.orbiter.finance`，以及 `*.orbk8s.com`。
- 指向当前 CDN：`cdn.orbiter.finance`。
- 指向 Amplify：根域、`app`、`www`、`bridge`、`beta`、`test`、`testnet`、`static`、`dealer.orbiter.finance`。
- 指向已删除 CloudFront：`get`、`whitepaper`、`testnet-cdn.orbiter.finance`。
- 指向已删除 ELB：`bridgex-api`、`bridgex-test`、`monitor`、`mq`、`testnet-api`、`tma-api`、`tma-test-api.orbiter.finance`。
- 旧固定 IP 记录：`goerli-submitter_rpc`、`iris_dashboard`、`l2api`、`nativeapi`、`pizza-api`、`rinkeby_dashboard`、`rpc-gateway.orbiter.finance`。这些 IP 不在当前账号活动 EC2/EIP 中；确认不是跨账号服务后删除。

不要误删 `tokenboat.com` Zone；其中 `tokenboat.com`、`www`、`agent-api`、`agent`、`api-docs` 已全部指向新的 Token Boat 资源。

## 5. P2：历史 Serverless 和外围资源

### 5.1 DynamoDB

[打开 DynamoDB Tables](https://ap-northeast-1.console.aws.amazon.com/dynamodbv2/home?region=ap-northeast-1#tables)

| Table | Items | 大小 | 计费模式 |
|---|---:|---:|---|
| `AirdropStatistics` | 12,610 | 1.30 MB | On-demand |
| `AirdropStatistics1` | 3,152 | 0.33 MB | On-demand |
| `HelloWorldDatabase` | 487 | 0.04 MB | Provisioned 5/5 |
| `airdropAddress` | 92,468 | 118.91 MB | On-demand |
| `community` | 2 | 0.002 MB | Provisioned 5/5 |
| `crossChainTransfer` | 6 | 0.001 MB | On-demand |
| `depositedvalue` | 1 | 0.0002 MB | Provisioned 5/5 |
| `eth2goNews` | 0 | 0 | Provisioned 5/5 |
| `luckyubi` | 1 | 0.0002 MB | Provisioned 5/5 |

这 9 张表均为 2020–2021 年遗留资源，没有 Token Boat 命名或依赖。建议先导出，再通过对应 CloudFormation Stack 删除；同时清理 DynamoDB Auto Scaling 和 14 条相关 CloudWatch Alarm。

### 5.2 CloudFormation

[打开 CloudFormation Stacks](https://ap-northeast-1.console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks)

除旧 EKS Velero Stack 外，还存在以下 21 个 2020–2021 年业务 Stack，建议先检查 Resources 页，再按 Stack 删除，不要逐个删除 Stack 管理的子资源：

`transferbfuse`、`transferfuse`、`transfercre`、`transferbcre`、`transferxcity`、`transfercity`、`luckyubi`、`xdaiwater`、`airdropStatistics`、`airdropAddress`、`getPosterInfo`、`ethdata`、`depositedvalue`、`uploadS3`、`postinfo`、`xdai`、`xdaiaddress`、`xyxdaiaddress`、`two`、`one`、`helloworld1`。

暂不建议随业务一起删除的共享/管理 Stack：`AWS-QuickSetup-SSM-LocalDeploymentRolesStack`、`CDKToolkit`、`aws-sam-cli-managed-default`。

### 5.3 Cognito、SNS、WAF

[Cognito User Pools](https://ap-northeast-1.console.aws.amazon.com/cognito/v2/idp/user-pools?region=ap-northeast-1) · [SNS Topics](https://ap-northeast-1.console.aws.amazon.com/sns/v3/home?region=ap-northeast-1#/topics) · [东京 WAF](https://ap-northeast-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=ap-northeast-1) · [Global WAF](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=us-east-1)

Cognito 仍有 8 个旧 Amplify Backend Manager User Pool，全部只有约 1 个用户，且名称中的 App ID 均不属于当前 4 个 Amplify App：

`ap-northeast-1_0aQUYDu9c`、`ap-northeast-1_2XRnMdCsT`、`ap-northeast-1_Ak4IjsS5K`、`ap-northeast-1_CPNVFNu9O`、`ap-northeast-1_RmaqMurPW`、`ap-northeast-1_Xz8Th2c2A`、`ap-northeast-1_aa3czthhm`、`ap-northeast-1_ohji64JdR`。

建议导出必要用户数据后删除。

SNS 共 8 个 Topic：

- 可删除的 5 个零订阅 Topic：`amplify-d1io55gyj94v3d_AMPLIBRANCHSENTINEL`、`amplify-d3ert5es4agug5_rinkeby`、`amplify-ddwthojoyyc8q_main`、`amplify-ddwthojoyyc8q_main_test`、`dynamodb`。
- 保留 3 个仍服务 Token Boat RDS 告警的 Topic：`Default_CloudWatch_Alarms_api`、`Liang`、`RDS_DB_Alert`。

WAF：

- Regional `ApiGateway-HTTP-Flood` 当前没有关联资源，可删除。
- Global 两个 `CreatedByAmplify-ddwthojoyyc8q-*` 随 Orbiter Amplify App 下线后删除。

### 5.4 ECR、ACM、Secrets Manager

[Virginia ECR](https://us-east-1.console.aws.amazon.com/ecr/repositories/private/952178321851?region=us-east-1) · [东京 ACM](https://ap-northeast-1.console.aws.amazon.com/acm/home?region=ap-northeast-1#/certificates/list) · [Virginia ACM](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates/list) · [Secrets Manager](https://ap-northeast-1.console.aws.amazon.com/secretsmanager/listsecrets?region=ap-northeast-1)

- Virginia 仍有 ECR Repo `aabank-telegram-server`。当前账号无权查看 Image 明细；确认 CI/CD 不再引用后删除。
- ACM 当前除 `tokenboat.com` 外还有 22 张非 Token Boat 证书：19 张已过期或当前 `InUseBy` 为空，可先删；2 张 `*.orbk8s.com` 绑定旧 `k8s` ALB，删除 ALB 后删；1 张 `*.orbiter.finance` 绑定 Orbiter CDN，删除 CloudFront 后删。
- Secrets Manager 只发现 `sqlworkbench!658fcb9c-1498-44fc-9e67-900e57cb0d86`。确认旧 SQL Workbench 连接不再使用后删除。

### 5.5 CloudWatch

[Log Groups](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups) · [Alarms](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#alarmsV2:) · [Dashboards](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#dashboards:)

| Log Group | 存储 | 建议 |
|---|---:|---|
| `dms-tasks-orbiter-v3` | 4.56 GB | DMS 已删除；归档后删除 |
| `/aws/redshift/orbiter-sql/userlog` | 327 B | Redshift 已删除；删除 |
| `e4e-logs-1` | 59.76 MB | 归属确认后删除 |
| `systemmanager` | 4 KB | SSM Quick Setup 仍在，先确认再删 |
| `RDSOSMetrics` | 190.42 MB | Token Boat RDS 使用；保留 |
| `/aws/eks/token-boat/cluster` | 当前 0 B | Token Boat；保留并设置合理 Retention |

CloudWatch Alarm 共 27 条：保留 2 条 `maker-explore` 告警；删除 14 条 DynamoDB 告警（随表下线）和 11 条指向已删除 EC2/RDS/API 的遗留告警。

Dashboard `td` 自 2023-12 后未更新，确认无人使用后删除。

### 5.6 Security Group

[打开东京 Security Groups](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#SecurityGroups:)

当前可清理的旧组：

- 0 ENI，可删除：`sg-0352bf111e078dd71`、`sg-0619a4b798ad6f42a`、`sg-02bf355398f6982b4`、`sg-064794c0bcf1720be`、`sg-08e56d16bade4aca1`、`sg-0fe69843fadcb7c73`、`sg-0a7d9b2962988e845`、`sg-023efd3d567429869`、`sg-0e80da5421c273ad4`。
- 删除 Classic ELB 后再删：`sg-01709866a1b2cbdf3`。
- 删除 4 个 VPC Endpoint 后再删：`sg-03c0a5cac1e3376bd`。
- `sg-eabddaa7` 是 default VPC 的 default SG，不能删除；旧 `k8s` ALB 删除后，应移除其不必要的 `0.0.0.0/0` 入站规则。

## 6. 明确保留：Token Boat 资源

以下资源不属于本次删除范围：

| 服务 | 资源 | 状态/说明 |
|---|---|---|
| EKS | [`token-boat`](https://ap-northeast-1.console.aws.amazon.com/eks/home?region=ap-northeast-1#/clusters/token-boat) | `ACTIVE`，Kubernetes 1.36 |
| EC2 | 4 台 c6g.large EKS Auto Mode Node | Token Boat 当前节点 |
| EC2 | `i-004a6932687b557f1` / `token-boat-middleware` | Token Boat Redis/中间件 |
| VPC | `vpc-0b05231b600908bdb` | Token Boat EKS、ALB、NAT、Middleware 所在 VPC |
| RDS | [`maker-explore`](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#database:id=maker-explore;is-cluster=false) | Token Boat 与 Agent API 生产 PostgreSQL，当前有活动连接 |
| RDS Snapshot | `full-0909`、`maker-explore-0908` | Token Boat 数据恢复点 |
| ALB | `token-boat-public`、`token-boat-public-v2`、`token-boat-agent-api` | Token Boat 正式入口/迁移入口 |
| ECR | `token-boat`、`token-boat-agent-api` | 当前生产镜像 |
| Amplify | `token-boat-api-docs`、`token-boat-agent` | 文档站和 Agent 前端 |
| Route 53 | `tokenboat.com` Zone | 正式域名与邮件 |
| ACM | `tokenboat.com` | 正式 TLS 证书 |
| SNS/CloudWatch | `maker-explore` 告警及其 3 个 SNS Topic | 生产数据库监控 |

新集群当前 `token-boat-master` 1/1、`token-boat-worker` 3/3、`token-boat-agent-api` 2/2 Ready；`agent-api.tokenboat.com` 已指向独立新 ALB。因此，删除本文列出的旧 Orbiter LB、EBS、VPC、IAM/OIDC 不会影响新的 Agent API，前提是严格按资源 ID 操作。

需要老板立即处理的 Token Boat 风险项（不是删除项）：

1. `maker-explore` 当前 `DeletionProtection=false`，建议立即开启删除保护。
2. 数据库当前 `PubliclyAccessible=true`，其 SG `sg-0758f49b92e6681d7` 对 `5432` 和 `5439` 开放 `0.0.0.0/0`；应收敛为 Token Boat NAT EIP 和必要办公出口 IP。

## 7. 推荐执行顺序

1. **审批数据保留期**：确认 Loki、Velero、EBS Snapshot、Official Bridge RDS Snapshot、Redshift Snapshot 的保留天数。
2. **下线公网入口**：删 Orbiter/Orbk8s/NBnB 业务 DNS；验证 Token Boat 域名仍正常。
3. **删前端和 CDN**：Amplify → WAF/SNS；CloudFront → `orbiter-bridge` S3。
4. **删旧 LB**：Classic ELB → NLB → `k8s` ALB；检查关联 ENI/EIP 是否释放。
5. **删高成本存储**：10 块空闲 EBS → 69 个 Orbiter Snapshot → Loki S3。
6. **删旧 VPC**：Endpoint → NAT → EIP → Subnet/Route/IGW/SG → VPC。
7. **删数据和 Serverless**：先导出 DynamoDB，再删除 21 个旧业务 Stack 和关联表/告警。
8. **删 IAM/ACM/Cognito/CloudWatch 尾项**。
9. **次日复核**：确认仅剩 Token Boat 计算、数据库、网络、域名和监控资源。

## 8. 当前账号权限盲区

本次复核使用 IAM User `liuhuanhui`。下列服务的 List/Describe 被拒绝，不能据此报告断言“没有资源”。老板需要用管理员权限在控制台补查，搜索关键词 `orbiter`、`bridge`、`aabank`、`ubi`、`nbnb`：

| 服务 | 管理页 |
|---|---|
| Lambda | [东京 Lambda](https://ap-northeast-1.console.aws.amazon.com/lambda/home?region=ap-northeast-1#/functions) |
| API Gateway v1/v2 | [东京 API Gateway](https://ap-northeast-1.console.aws.amazon.com/apigateway/main/apis?region=ap-northeast-1) |
| ECS | [东京 ECS](https://ap-northeast-1.console.aws.amazon.com/ecs/v2/clusters?region=ap-northeast-1) |
| ElastiCache / MemoryDB | [ElastiCache](https://ap-northeast-1.console.aws.amazon.com/elasticache/home?region=ap-northeast-1) · [MemoryDB](https://ap-northeast-1.console.aws.amazon.com/memorydb/home?region=ap-northeast-1) |
| Amazon MQ | [东京 MQ](https://ap-northeast-1.console.aws.amazon.com/amazon-mq/home?region=ap-northeast-1#/brokers) |
| EFS / FSx | [EFS](https://ap-northeast-1.console.aws.amazon.com/efs/home?region=ap-northeast-1#/file-systems) · [FSx](https://ap-northeast-1.console.aws.amazon.com/fsx/home?region=ap-northeast-1#file-systems) |
| SQS / EventBridge | [SQS](https://ap-northeast-1.console.aws.amazon.com/sqs/v3/home?region=ap-northeast-1#/queues) · [EventBridge](https://ap-northeast-1.console.aws.amazon.com/events/home?region=ap-northeast-1#/rules) |
| Kinesis / Firehose | [Kinesis](https://ap-northeast-1.console.aws.amazon.com/kinesis/home?region=ap-northeast-1) |
| SageMaker | [东京 SageMaker](https://ap-northeast-1.console.aws.amazon.com/sagemaker/home?region=ap-northeast-1) |
| AWS Backup | [东京 AWS Backup](https://ap-northeast-1.console.aws.amazon.com/backup/home?region=ap-northeast-1) |
| Lightsail | [Lightsail](https://lightsail.aws.amazon.com/ls/webapp/home/instances) |
| Global Accelerator | [Global Accelerator](https://us-west-2.console.aws.amazon.com/globalaccelerator/home) |
| VPC Route Table/NACL、NAT 详情 | [东京 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1) |

另外，本账号无权查看 ELB Target Group/Tag、ECR Image 明细、S3 Lifecycle/Versioning、IAM Customer Managed Policy 和 FSx Backup。删除前应由管理员补查这些依赖。

## 9. 老板审批勾选项

- [ ] 同意下线 `orbiter.finance` 网站/API/CDN，并接受 DNS 删除后立即不可访问。
- [ ] 确认 `nbnb.io` 是否纳入本次下线。
- [ ] 确认 Orbiter 邮箱是否停用；未停用则保留 MX/SPF/DKIM。
- [ ] 确认 Loki、Velero、EBS、RDS、Redshift 的最终保留期限。
- [ ] 同意删除 10 块空闲 EBS、旧 VPC NAT/Endpoint/EIP 和 3 个旧 LB。
- [ ] 同意删除 9 张旧 DynamoDB 表及 21 个历史业务 Stack。
- [ ] 管理员完成权限盲区服务的补查。
- [ ] 开启 `maker-explore` 删除保护并收敛公网数据库 SG。
- [ ] 删除完成后复核 Token Boat 首页、API、Agent API、Agent 前端和数据库连接。
