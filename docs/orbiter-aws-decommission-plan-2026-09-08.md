# Orbiter AWS 资源下线与成本回收执行方案

> 文档日期：2026-09-08  
> AWS 账号：`952178321851`  
> 主要区域：东京 `ap-northeast-1`  
> 全局资源：CloudFront、Route 53、IAM、Global WAF  
> 文档状态：待审批、待执行  
> 重要说明：本次仅完成只读审计，尚未删除、停止或修改任何 AWS/Kubernetes 资源。

## 1. 管理层摘要

Orbiter 下线后，可以释放 EKS 内 Orbiter 工作负载，以及 EC2、RDS 只读库、Official Bridge 数据库、Amazon MQ、DMS、Redshift、Amplify、CloudFront、ECR、S3、负载均衡、旧 VPC 和遗留 Serverless 资源。

Token Boat 与 Orbiter 当前共享部分 AWS 基础设施。因此，不能按资源名称直接删除所有包含 `orbiter` 或 `maker` 的资源。

### 1.1 成本概况

2026 年 8 月账号主要费用如下：

| 服务 | 8 月费用 | 下线后的处理 |
|---|---:|---|
| RDS | `$1,865.17` | 保留 `maker-explore`；删除只读库和 Official Bridge 数据库 |
| EC2 计算 | `$1,509.71` | 删除 5 台非 Token Boat EC2；EKS 根据剩余负载缩容 |
| EC2 Other | `$1,156.59` | 减少 NAT 流量、EBS、快照、EIP 和跨 VPC 流量 |
| Amazon MQ | `$302.92` | 完整下线 `official_bridge` |
| Redshift | `$233.56` | 数据归档后删除 |
| Elastic Load Balancing | `$225.60` | 10 个 LB 中保留 2 个、释放 8 个 |
| VPC | `$199.01` | 删除空闲 VPC、4 个 Endpoint、1 个 NAT 和相关 EIP |
| EKS 服务费 | `$138.04` | 集群保留，Token Boat 仍在使用 |
| DMS | `$90.23` | 停止复制后完整删除 |
| CloudWatch | `$87.30` | 删除旧日志组并设置保留期 |
| Amplify | `$62.85` | 29 个 App 中保留 2 个、释放 27 个 |
| WAF | `$27.26` | 删除 Orbiter WAF 和孤儿 Web ACL |
| ECR | `$25.11` | 删除 36 个非 Token Boat 仓库 |
| Direct Connect | `$21.58` | 业务确认无用途后删除 |
| S3 | `$21.68` | 删除旧 Bucket；Loki Bucket 保留并配置日志保留期 |

预计完整执行后每月可减少约 **`$2,500–$3,500`**。实际金额取决于 RDS 存储计费、NAT 流量下降幅度、EKS 节点缩容和快照增量占用。

### 1.2 需要老板审批的事项

- [ ] 批准 Orbiter、Official Bridge、Maker、10k、BIR、CrazyGrant 等所有非 Token Boat 项目下线。
- [ ] 确认 `orbiter.finance` 域名和企业邮箱是否继续保留。
- [ ] 确认 Direct Connect `dxcon-fgh9jlyc` 已无业务用途。
- [ ] 确认旧 RDS、DynamoDB、Redshift、S3 数据的法务和审计保留期限。
- [ ] 批准先 Stop 观察、再永久删除 EC2/RDS/MQ 的两阶段方案。
- [ ] 批准轮换 Amplify 中已经暴露的明文凭据。

## 2. AWS 管理入口

| 服务 | 管理页面 |
|---|---|
| Billing | [账单首页](https://us-east-1.console.aws.amazon.com/costmanagement/home#/dashboard) |
| Cost Explorer | [费用分析](https://us-east-1.console.aws.amazon.com/costmanagement/home#/cost-explorer) |
| EKS | [东京 EKS 集群](https://ap-northeast-1.console.aws.amazon.com/eks/home?region=ap-northeast-1#/clusters) |
| EC2 | [东京 EC2 实例](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Instances:) |
| Load Balancer | [东京负载均衡](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:) |
| EBS | [东京 EBS 卷](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Volumes:) |
| EBS Snapshot | [东京 EBS 快照](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Snapshots:visibility=owned-by-me) |
| VPC | [东京 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:) |
| NAT Gateway | [东京 NAT Gateway](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#NatGateways:) |
| VPC Endpoint | [东京 VPC Endpoint](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#Endpoints:) |
| Elastic IP | [东京 EIP](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Addresses:) |
| Security Group | [东京安全组](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#SecurityGroups:) |
| RDS | [东京 RDS 数据库](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#databases:) |
| RDS Snapshot | [东京 RDS 快照](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#snapshots-list:) |
| DMS | [东京 DMS](https://ap-northeast-1.console.aws.amazon.com/dms/v2/home?region=ap-northeast-1) |
| Redshift | [东京 Redshift](https://ap-northeast-1.console.aws.amazon.com/redshiftv2/home?region=ap-northeast-1) |
| Amazon MQ | [东京 Amazon MQ](https://ap-northeast-1.console.aws.amazon.com/amazon-mq/home?region=ap-northeast-1#/brokers) |
| Amplify | [东京 Amplify Apps](https://ap-northeast-1.console.aws.amazon.com/amplify/apps?region=ap-northeast-1) |
| CloudFront | [CloudFront Distributions](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions) |
| Route 53 | [Hosted Zones](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones) |
| ECR | [东京 ECR](https://ap-northeast-1.console.aws.amazon.com/ecr/repositories/private/952178321851?region=ap-northeast-1) |
| S3 | [S3 Bucket 列表](https://s3.console.aws.amazon.com/s3/buckets) |
| DynamoDB | [东京 DynamoDB](https://ap-northeast-1.console.aws.amazon.com/dynamodbv2/home?region=ap-northeast-1#tables) |
| CloudFormation | [东京 CloudFormation](https://ap-northeast-1.console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks) |
| CloudWatch Logs | [东京日志组](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups) |
| CloudWatch Alarms | [东京告警](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#alarmsV2:) |
| WAF | [东京 WAF](https://ap-northeast-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=ap-northeast-1) |
| Global WAF | [Global WAF](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=global) |
| ACM 东京 | [东京证书](https://ap-northeast-1.console.aws.amazon.com/acm/home?region=ap-northeast-1#/certificates/list) |
| ACM Virginia | [Virginia 证书](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates/list) |
| IAM Roles | [IAM Roles](https://us-east-1.console.aws.amazon.com/iam/home#/roles) |
| Cognito | [东京 Cognito](https://ap-northeast-1.console.aws.amazon.com/cognito/v2/idp/user-pools?region=ap-northeast-1) |
| Secrets Manager | [东京 Secrets](https://ap-northeast-1.console.aws.amazon.com/secretsmanager/listsecrets?region=ap-northeast-1) |
| Direct Connect | [Direct Connect](https://ap-northeast-1.console.aws.amazon.com/directconnect/v2/home?region=ap-northeast-1#/connections) |

## 3. 禁止删除：Token Boat 依赖资源

这些资源必须加入删除保护清单。任何批量清理脚本、CloudFormation 删除或控制台操作都要排除它们。

| 类型 | 资源 | 管理页面 | 保留原因 |
|---|---|---|---|
| EKS | `orbiter-finance` | [打开集群](https://ap-northeast-1.console.aws.amazon.com/eks/home?region=ap-northeast-1#/clusters/orbiter-finance) | Token Boat、Agent API、monitoring、ingress、Istio 均在此集群运行 |
| VPC | `vpc-0b05231b600908bdb` | [打开 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:VpcId=vpc-0b05231b600908bdb) | 当前 EKS 所在 VPC |
| VPC | `vpc-ab8f6acd` | [打开 VPC](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:VpcId=vpc-ab8f6acd) | Token Boat 数据库和 Redis 位于该 VPC |
| RDS | `maker-explore` | [打开 RDS](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#database:id=maker-explore;is-cluster=false) | Token Boat 和 Agent API 的生产 PostgreSQL |
| EC2 | `middleware-service` / `i-0d32c834ead1ac5e1` | [打开实例](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#InstanceDetails:instanceId=i-0d32c834ead1ac5e1) | 私网 IP `172.31.15.167`，Token Boat Redis |
| ECR | `token-boat` | [打开 ECR](https://ap-northeast-1.console.aws.amazon.com/ecr/repositories/private/952178321851/token-boat?region=ap-northeast-1) | Token Boat 镜像 |
| ECR | `token-boat-agent-api` | [打开 ECR](https://ap-northeast-1.console.aws.amazon.com/ecr/repositories/private/952178321851/token-boat-agent-api?region=ap-northeast-1) | Agent API 镜像 |
| Amplify | `d1qoeh8wcvxexl` / `token-boat-api-docs` | [打开 App](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1qoeh8wcvxexl/overview?region=ap-northeast-1) | Token Boat 文档站 |
| Amplify | `d2dhutwymwkh8c` / `token-boat-agent` | [打开 App](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2dhutwymwkh8c/overview?region=ap-northeast-1) | Token Boat Agent 前端 |
| NLB | `a80bc00be375e4636977fc4dd30bd81d` | [负载均衡列表](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:) | nginx 入口，服务 Token Boat 和其他共享域名 |
| Classic ELB | `aab466a1dfb7e4f0084d2038698bf152` | [负载均衡列表](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:) | 外部 Istio 共享入口，Token Boat VirtualService 仍使用 |
| Route 53 | `tokenboat.com` / Zone `Z081207432K53WY2YJLLX` | [打开 Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z081207432K53WY2YJLLX) | Token Boat 正式域名 |
| Route 53 | `orbk8s.com` / Zone `Z01909693VMTQ0S20M3Y5` | [打开 Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z01909693VMTQ0S20M3Y5) | Token Boat 仍使用共享通配入口 |
| ACM | `*.orbk8s.com` 两张有效证书 | [东京 ACM](https://ap-northeast-1.console.aws.amazon.com/acm/home?region=ap-northeast-1#/certificates/list) | 当前共享入口 HTTPS |
| S3 | `eks-loki-obt` | [打开 Bucket](https://s3.console.aws.amazon.com/s3/buckets/eks-loki-obt?region=ap-northeast-1&tab=objects) | 当前 Loki 存储，Token Boat 日志依赖 |
| S3 | `orbiter-velero-backups-tokyo` | [打开 Bucket](https://s3.console.aws.amazon.com/s3/buckets/orbiter-velero-backups-tokyo?region=ap-northeast-1&tab=objects) | 当前 EKS Velero BackupStorageLocation |
| IAM | `eks-velero-backup-role` | [IAM Roles](https://us-east-1.console.aws.amazon.com/iam/home#/roles) | 当前 EKS 备份 |
| RDS Snapshot | `maker-explore-token-boat-*` | [RDS 快照](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#snapshots-list:) | Token Boat 发布与回滚快照 |

还必须保留两个 VPC 之间的私网路由/Peering，以及当前 EKS 的 3 个 NAT Gateway。Token Boat 需要从 `192.168.0.0/16` 的 EKS VPC 访问 `172.31.0.0/16` 中的 RDS 和 Redis。

## 4. 第一阶段：可以优先处理的低风险资源

### 4.1 空闲 VPC `vpc-02dcfef555a661b85`

[打开 VPC 管理页面](https://ap-northeast-1.console.aws.amazon.com/vpcconsole/home?region=ap-northeast-1#vpcs:VpcId=vpc-02dcfef555a661b85)

审计结果：该 VPC 内没有 EC2、EKS、RDS 等业务实例，现存 ENI 只属于 4 个 VPC Endpoint 和 1 个 NAT Gateway。

| 资源 | ID/名称 | 操作 |
|---|---|---|
| VPC Endpoint | `vpce-0586074c7f4ee29f3` / SSM | 删除 |
| VPC Endpoint | `vpce-0cafe433e9609c156` / EC2 Messages | 删除 |
| VPC Endpoint | `vpce-0bb393d5d9934d88c` / SSM Messages | 删除 |
| VPC Endpoint | `vpce-0cab1c803423f3e41` / EC2 | 删除 |
| NAT Gateway | `nat-0479f334dd0b10353` | 删除并等待状态变为 Deleted |
| Elastic IP | 公网 IP `3.114.234.192` | NAT 删除后释放 |
| Internet Gateway | `igw-06dfd9dcfd1eacc89` | Detach 后删除 |
| Public Subnet | `subnet-090225949ba7ca8cc` | 删除 |
| Private Subnet | `subnet-0807a41551fb73acb` | 删除 |
| Security Group | `sg-0a2345da55eea770a` 等该 VPC 自定义 SG | 删除，默认 SG 随 VPC 删除 |
| VPC | `vpc-02dcfef555a661b85` | 最后删除 |

控制台顺序：Endpoint → NAT → EIP → 路由/子网 → IGW → 自定义 SG → VPC。

### 4.2 零流量和遗留负载均衡

[打开负载均衡管理页面](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#LoadBalancers:)

| 资源 | 类型 | 最近 8 天 | 关联/备注 | 建议 |
|---|---|---:|---|---|
| `bridgex-test` | ALB | 0 请求 | `bridgex-test.orbiter.finance` | DNS 删除后释放 |
| `testapi` | ALB | 0 请求 | `testnet-api.orbiter.finance` | DNS 删除后释放 |
| `k8s` | ALB | 0 请求 | 默认 VPC 遗留 K8s ALB | Listener/Target Group 一并删除 |
| `a348148a400ee4b20ba70255ef3c9b16` | Classic ELB | 0 请求 | 旧 `aabank`，`jmsweb.orbk8s.com` 指向它 | 先删除 DNS，再删除 ELB |
| `a6eaae90d7f3c43e58dae2130042ba73` | NLB | 0 Flow | 已删除的 `dashboard-prod/rpc-gateway-rpchub` | 孤儿资源，可释放 |
| `a1f79ea750a634180a68c52ce3e9a3d2` | Classic ELB | 0 请求 | 旧 Istio internal | 孤儿资源，可释放 |
| `k8s-istiosys-istioing-a360cf9871` | Internal NLB | 0 Flow | 当前没有 Active VirtualService 使用 | EKS internal ingress 删除后释放 |

以下 LB 仍有流量，放到业务停机阶段：

- `bridgex-api`：最近 8 天约 `90,589` 请求。

以下两个必须保留：

- `a80bc00be375e4636977fc4dd30bd81d`：最近 8 天约 550 万新连接。
- `aab466a1dfb7e4f0084d2038698bf152`：最近 8 天约 57.8 万请求，Token Boat 仍使用。

### 4.3 旧 EKS 安全组

[打开安全组管理页面](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#SecurityGroups:)

| 安全组 | 来源 | 当前 ENI | 处理 |
|---|---|---|---|
| `sg-08e56d16bade4aca1` | 旧 `orbiter` ELB | 无 | 删除 |
| `sg-0fe69843fadcb7c73` | 旧 `orbiter_web3` ELB | 无 | 删除 |
| `sg-064794c0bcf1720be` | 旧 `aabank` EKS Cluster SG | 无 | 删除 |
| `sg-0a7d9b2962988e845` | 旧 `aabank` ELB | 有，属于旧 Classic ELB | 先删 ELB 后删除 |
| `sg-0619a4b798ad6f42a` | 旧 `orbiter` EKS Cluster SG | 无 | 删除 |
| `sg-02bf355398f6982b4` | 旧 `orbiter_web3` EKS Cluster SG | 无 | 删除 |

不要删除包含 `orbiter-finance` 标签的当前集群安全组。

### 4.4 WAF

| Web ACL | Scope | 状态 | 管理页面 | 处理 |
|---|---|---|---|---|
| `ApiGateway-HTTP-Flood` | Regional/Tokyo | 没有关联资源 | [东京 WAF](https://ap-northeast-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=ap-northeast-1) | 可直接删除 |
| `CreatedByAmplify-ddwthojoyyc8q-17b8...` | CloudFront | OrbiterBridgeFe 管理 | [Global WAF](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=global) | 删除 Amplify App 后检查并删除 |
| `CreatedByAmplify-ddwthojoyyc8q-d9e30...` | CloudFront | OrbiterBridgeFe 管理 | [Global WAF](https://us-east-1.console.aws.amazon.com/wafv2/homev2/web-acls?region=global) | 删除 Amplify App 后检查并删除 |

### 4.5 过期证书

[东京 ACM](https://ap-northeast-1.console.aws.amazon.com/acm/home?region=ap-northeast-1#/certificates/list) · [Virginia ACM](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates/list)

共发现 11 张过期证书，包括：

- `*.layer220.io`
- `*.zookey.io`
- `*.10kx.com`
- `monitorlog.joeyzhou.xyz`
- `*.crazy.tech`
- `*.infinitystarter.io`
- 旧 `*.orbiter.finance`
- `www.joeyzhou.xyz`
- `ipa.10kx.com`
- `cdn.zookey.io`
- Virginia 的旧 `*.zookey.io`

旧 `*.orbiter.finance` 仍显示关联到 `bridgex-api`、`bridgex-test`、`testapi` Listener。先从 Listener 移除过期证书，确认有效证书仍在，再删除。

### 4.6 旧 AMI 和 EBS Snapshot

| 资源 | 管理页面 | 说明 | 处理 |
|---|---|---|---|
| `ami-05fff1bf79d2bb753` | [东京 AMI](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Images:visibility=owned-by-me) | 2023 年 AWSSupport EC2 Rescue 临时备份 | Deregister |
| `snap-0a626798dc5d20008` | [东京快照](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Snapshots:visibility=owned-by-me) | 上述 AMI 的 80 GiB 快照 | AMI Deregister 后删除 |

当前还有 Velero 自动创建的 EBS 快照。不要直接在 EC2 控制台批量删除，应让 Velero 按 720 小时 TTL 自动回收。

## 5. 第二阶段：EKS 内 Orbiter 下线

[打开 `orbiter-finance` 集群](https://ap-northeast-1.console.aws.amazon.com/eks/home?region=ap-northeast-1#/clusters/orbiter-finance)

### 5.1 删除 Orbiter 应用

`explore-prod` 中待删除的 Helm Release/Deployment：

1. `dashboard-api`
2. `explore-crawler`
3. `explore-refinery`
4. `liquidity-system`
5. `monitoring-holders-obt`
6. `public-exchange-rate`
7. `router-manager`

同时删除：

- 2 个仍在运行的 CronJob。
- 58 个历史 Job。
- 9 个 Service。
- 3 个 Ingress。
- 8 个 Istio VirtualService。
- 6 个 DestinationRule。
- 4 个 ServiceMonitor。
- 50 个 Orbiter Secrets。

`explore-prod` 没有 PVC，删除应用不会触发业务磁盘删除。

### 5.2 删除空命名空间

- `dashboard-prod`：没有 Pod/Deployment，现有 Service 没有 Endpoint，Ingress/VirtualService 指向不存在的后端。
- `beta-prod`：空命名空间。

删除 `dashboard-prod` 前确认遗留 NLB `a6eaae90d7f3c43e58dae2130042ba73` 已不再需要。

### 5.3 删除 Consul

`consul-prod` 只被 Orbiter 应用引用，Token Boat 未引用。

现有资源：

- 2 个 Deployment。
- 1 个 StatefulSet。
- 1 个 DaemonSet。
- 7 个 Pod。
- 4 个 Service。
- 3 个 PVC，每个 10 GiB。

执行顺序：

1. 先停止 `explore-prod` Orbiter 应用。
2. 导出 Consul KV/configuration snapshot。
3. 确认没有客户端连接。
4. 删除 `consul-prod` Helm Release 和 namespace。
5. 确认 3 个 PV/EBS Volume 已按 ReclaimPolicy `Delete` 回收。
6. 确认 Velero 后续每日备份快照数从 7 个下降到约 4 个。

### 5.4 删除 Orbiter 专用 Istio/OTel 资源

删除：

- `istio-ingress-internal` Helm Release。
- Gateways：
  - `default/grpc-orbk8s-gateway`
  - `default/orbk8s-gateway-http2`
  - `default/orbk8s-internal-gateway`
- Secret：`istio-system/orbiter-finance-tls`
- 遗留 OpenTelemetry Operator 的 3 个 ClusterRole、2 个 ClusterRoleBinding、MutatingWebhook、ValidatingWebhook 和 4 个 CRD。

保留：

- `default/orbk8s-gateway`
- `istio-system/opentelemetry-collector`
- monitoring 中的 Prometheus、Grafana、Loki、Alertmanager。

## 6. 第三阶段：EC2、RDS、MQ 和分析链路

### 6.1 EC2 停机清单

[打开东京 EC2](https://ap-northeast-1.console.aws.amazon.com/ec2/home?region=ap-northeast-1#Instances:)

| 名称 | 实例 ID | 规格 | 最近状态 | 第一步 | 最终处理 |
|---|---|---|---|---|---|
| `maker_ee73` | `i-081d3f8ceadd7bc31` | c6a.2xlarge | 8 天约 22.7 TiB NetworkIn，仍活跃 | Stop 观察 48–72 小时 | 创建最终 AMI 后 Terminate |
| `MAKER_80` | `i-06103d5fa7c5694d7` | c6a.xlarge | 8 天约 4.2 TiB NetworkIn，仍活跃 | Stop 观察 48–72 小时 | 创建最终 AMI 后 Terminate |
| `officialBridge_submitter` | `i-02b2146111d43c4a7` | t3.large | 低流量但仍在线 | Stop 观察 24–48 小时 | Terminate，释放 EIP |
| `officialBridge_Relay` | `i-08dabb93afbe4af3f` | t3.large | 低流量但仍在线 | Stop 观察 24–48 小时 | Terminate，释放 EIP |
| `officialBridge_mid` | `i-0789d6cb835dc57a7` | t3.large | 仍有明显网络流量 | Stop 观察 48 小时 | Terminate，释放 EIP |

对应 Official Bridge EIP：

- `18.179.79.219`
- `52.192.23.44`
- `18.182.73.178`

停止实例后检查 CloudWatch、ALB Target Health、RDS Connection、MQ Connection。如果出现 Token Boat 异常，应立即 Start 实例回滚。

禁止停止：`i-0d32c834ead1ac5e1` / `middleware-service`。

### 6.2 RDS

[打开东京 RDS](https://ap-northeast-1.console.aws.amazon.com/rds/home?region=ap-northeast-1#databases:)

| 数据库 | 规格/存储 | 最近状态 | 处理 |
|---|---|---|---|
| `maker-explore` | db.t3.xlarge / 2929 GiB gp3 | Token Boat 生产数据库 | **保留** |
| `maker-explore-readonly` | db.t3.xlarge / 2000 GiB gp3 | 最近连接峰值约 73 | 调用方停止、连接归零后删除 |
| `official-bridge-server` | db.t3.medium / 500 GiB io2 | 最近连接峰值约 15 | Official Bridge 停止后做最终快照并删除 |

删除步骤：

1. 在 Performance Insights/CloudWatch 查看连接来源。
2. 停止应用后连续观察至少 24 小时。
3. 创建最终手工快照，命名建议：
   - `maker-explore-readonly-orbiter-final-20260908`
   - `official-bridge-server-final-20260908`
4. 关闭 Deletion protection。
5. 删除 `maker-explore-readonly` 和 `official-bridge-server`。
6. 保留最终快照 30–90 天，之后再申请删除。

可单独评估删除的旧手工快照：

- `make-bak-snapshot`，逻辑容量 2929 GiB。
- `obbridge-uat-snapshot`，逻辑容量 2420 GiB。

### 6.3 DMS → Redshift 链路

[打开 DMS](https://ap-northeast-1.console.aws.amazon.com/dms/v2/home?region=ap-northeast-1) · [打开 Redshift](https://ap-northeast-1.console.aws.amazon.com/redshiftv2/home?region=ap-northeast-1)

当前链路：

`maker-explore（保留） → DMS orbiter-v3 → Redshift orbiter-redshift`

待删除资源：

- DMS Replication Instance：`orbiter-v3`，dms.t3.medium，100 GiB。
- DMS Tasks：
  - `active-platform`
  - `orbiter-prod`
- DMS Endpoints：
  - `maker-explore` source
  - `orbiter-redshift-prod`
  - `redshift-data-new`
  - 遗留 `inscription`
  - 遗留 `obbridge-goerli`
- Redshift Cluster：`orbiter-redshift`，dc2.large × 1。

注意：Redshift 最近 CPU 平均约 38%、峰值 98%，数据库连接峰值约 17，当前仍有使用迹象。

操作顺序：

1. 业务负责人确认报表、BI、分析查询全部停止。
2. 停止 `active-platform` 和 `orbiter-prod` DMS Task。
3. 确认 CDC Lag 不再有业务要求。
4. 导出需要保留的数据或创建 Redshift Manual Snapshot。
5. 删除 DMS Tasks。
6. 删除 DMS Endpoints。
7. 删除 DMS Replication Instance 和 subnet group。
8. 删除 Redshift Cluster。
9. 删除 DMS IAM Role、日志组和 S3 临时 Bucket。

### 6.4 Amazon MQ

[打开 Amazon MQ](https://ap-northeast-1.console.aws.amazon.com/amazon-mq/home?region=ap-northeast-1#/brokers)

- Broker 名称：`official_bridge`
- Broker ID：`b-5e7e2b55-4394-4e55-8187-109b6d16e2a5`
- 引擎：RabbitMQ
- 规格：单节点 `mq.m5.large`
- 费用：约 `$303/月`
- 最近观察：约 12 个连接、15 个 Consumer，队列消息量很低但仍有客户端在线。

操作顺序：

1. 停止 Maker 和 Official Bridge 客户端。
2. 确认 ConnectionCount 和 ConsumerCount 归零。
3. 导出 RabbitMQ definitions、users、vhosts、permissions、policies。
4. 确认没有未消费消息。
5. 删除 Broker。
6. 删除 `/aws/amazonmq/broker/b-5e7e2b55-4394-4e55-8187-109b6d16e2a5/*` 日志组。

### 6.5 Direct Connect

[打开 Direct Connect](https://ap-northeast-1.console.aws.amazon.com/directconnect/v2/home?region=ap-northeast-1#/connections)

- Connection：`dxcon-fgh9jlyc`
- Virtual Interface：`dxvif-ffwmrvps`
- 月费用约 `$21.58`
- 连接状态指标正常，但最近观察到 ingress 为 0。

必须由网络负责人确认没有办公室、机房、合作方或专线 BGP 依赖后才能删除。先删除 VIF，再删除 Connection。

## 7. 第四阶段：Amplify、CloudFront、Route 53 和 WAF

### 7.1 Amplify App 清单

[打开 Amplify App 列表](https://ap-northeast-1.console.aws.amazon.com/amplify/apps?region=ap-northeast-1)

保留 2 个 Token Boat App：

- [`d1qoeh8wcvxexl` / `token-boat-api-docs`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1qoeh8wcvxexl/overview?region=ap-northeast-1)
- [`d2dhutwymwkh8c` / `token-boat-agent`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2dhutwymwkh8c/overview?region=ap-northeast-1)

删除候选 27 个：

| App ID | 名称 | 最近 8 天流量/状态 | 处理 |
|---|---|---|---|
| [`ddwthojoyyc8q`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/ddwthojoyyc8q/overview?region=ap-northeast-1) | OrbiterBridgeFe 2.0 | 约 237 万请求，仍高度活跃 | 维护公告、切流后删除 |
| [`d2ps0ulbl914sr`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2ps0ulbl914sr/overview?region=ap-northeast-1) | official-bridge-app | 约 5.3 万请求 | Official Bridge 下线后删除 |
| [`da154jzoismbt`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/da154jzoismbt/overview?region=ap-northeast-1) | 10k_x-frontend | 约 8.3 万请求 | 所有者确认后删除 |
| [`devp3c9pv4up7`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/devp3c9pv4up7/overview?region=ap-northeast-1) | 10k_dex-frontend | 约 5.9 万请求 | 所有者确认后删除 |
| [`d1mzdj5weo6zbw`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1mzdj5weo6zbw/overview?region=ap-northeast-1) | OB_Bounty | 约 2.6 万请求 | Orbiter 下线后删除 |
| [`d1la9oj026cb85`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1la9oj026cb85/overview?region=ap-northeast-1) | CrazyGrantFrontend | 约 2.3 万请求 | 所有者确认后删除 |
| [`d2igg6o2s3xaz8`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2igg6o2s3xaz8/overview?region=ap-northeast-1) | compensation-orbiter | 约 2.1 万请求 | 删除 |
| [`d25vn58orjgdq3`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d25vn58orjgdq3/overview?region=ap-northeast-1) | walletPolicy | 约 1.2 万请求 | 删除关联 Backend Stack 后删除 |
| [`dwsg5kf6g2mtj`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dwsg5kf6g2mtj/overview?region=ap-northeast-1) | nbnb.io | 约 1.1 万请求 | 所有者确认后删除 |
| [`dw4ckstm90jo`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dw4ckstm90jo/overview?region=ap-northeast-1) | OB_Explorer | 约 7,300 请求 | 删除 |
| [`d1gvxr4ksh41ce`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1gvxr4ksh41ce/overview?region=ap-northeast-1) | dashboard-prod | 约 6,600 请求 | 删除 |
| [`dorx8n6d7mgzw`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dorx8n6d7mgzw/overview?region=ap-northeast-1) | manta-airdrop-reward-prod | 约 3,800 请求 | 删除 |
| [`d35wgjly4ddc7b`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d35wgjly4ddc7b/overview?region=ap-northeast-1) | Goerli_OB_Explorer_old | 约 3,400 请求 | 删除 |
| [`d3629fg848hgb0`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d3629fg848hgb0/overview?region=ap-northeast-1) | OrbiterMiniApp | 约 3,300 请求 | 删除 |
| [`d22cxa3rbcn6uu`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d22cxa3rbcn6uu/overview?region=ap-northeast-1) | Blockchain-Interactive-Robot | 约 2,400 请求 | 所有者确认后删除 |
| [`d22avygw56o5au`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d22avygw56o5au/overview?region=ap-northeast-1) | dashboard-outside | 约 2,000 请求 | 删除 |
| [`d2eora7bggrb72`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2eora7bggrb72/overview?region=ap-northeast-1) | Official Bridge Proof Submission Widget | 约 936 请求 | 删除 |
| [`d2ldxvmn4q6r2c`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2ldxvmn4q6r2c/overview?region=ap-northeast-1) | RPC-Gateway | 约 916 请求 | 删除 |
| [`d36tuuwml48cmz`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d36tuuwml48cmz/overview?region=ap-northeast-1) | 10k_swap-frontend | 约 909 请求 | 所有者确认后删除 |
| [`d1aa1azxmqdugd`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1aa1azxmqdugd/overview?region=ap-northeast-1) | official-bridge-app-dashboard | 约 636 请求 | 删除 |
| [`d10kskjwcvg9hf`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d10kskjwcvg9hf/overview?region=ap-northeast-1) | Inscription-refund-record | 约 509 请求 | 删除 |
| [`dos77zug4u6cs`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/dos77zug4u6cs/overview?region=ap-northeast-1) | secret-web | 约 439 请求 | 所有者确认后删除 |
| [`d1qq96ma1oxll`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1qq96ma1oxll/overview?region=ap-northeast-1) | CrazyGrantFrontend-maker | 约 343 请求 | 所有者确认后删除 |
| [`d1sidvba2p6i8c`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1sidvba2p6i8c/overview?region=ap-northeast-1) | 10kdex_admin_frontend | 约 342 请求 | 所有者确认后删除 |
| [`d1wfgfjtnbm40a`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d1wfgfjtnbm40a/overview?region=ap-northeast-1) | dashboard-goerli | 约 279 请求 | 删除 |
| [`d2dmsvoil15swx`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d2dmsvoil15swx/overview?region=ap-northeast-1) | manta-airdrop-reward-goerli | 约 60 请求 | 删除 |
| [`d46geic130k5l`](https://ap-northeast-1.console.aws.amazon.com/amplify/apps/d46geic130k5l/overview?region=ap-northeast-1) | dashboard-community | 约 23 请求 | 删除 |

每个 App 的操作顺序：

1. 导出 Domain association、Branch、Build settings 和环境变量清单到安全位置。
2. 不要在普通文档或聊天中粘贴环境变量值。
3. 切换 DNS 或展示下线页。
4. 停止/删除 Branch。
5. 删除 App。
6. 检查 Amplify 创建的 CloudFront、WAF、IAM Role、CloudWatch Log Group、Cognito 和 CloudFormation 是否残留。

安全事项：`OrbiterBridgeFe 2.0` 环境变量中存在明文凭据，并在本次审计查询输出中出现过。必须尽快轮换关联的 Sentry/Blog 凭据，不应等到最后删除 App 时再处理。

### 7.2 CloudFront

[打开 CloudFront](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions)

| Distribution ID | 域名 | 最近 8 天流量 | S3 Origin | 处理 |
|---|---|---:|---|---|
| [`E2DPRCY9PR6N5J`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E2DPRCY9PR6N5J) | `cdn.orbiter.finance` | 约 31.5 万请求、28 GiB | `orbiter-bridge` | 业务切流后 Disable，等待部署完成，再 Delete |
| [`E1SOZG5KBULOKH`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E1SOZG5KBULOKH) | `get.orbiter.finance` | 约 4,393 请求 | `get.orbiter.finance` | 下线后删除 |
| [`E1ZXIBVECRLYHB`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E1ZXIBVECRLYHB) | `whitepaper.orbiter.finance` | 约 37 请求 | `whitepaper.orbiter.finance` | 归档后删除 |
| [`E4YBZVXTUH9NC`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E4YBZVXTUH9NC) | `testnet-cdn.orbiter.finance` | 约 245 请求 | 旧 testnet Origin | 删除 |
| [`ESAXYV4R9UNT`](https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/ESAXYV4R9UNT) | `whitepaper.ubi.city` | 0 请求 | `whitepaper.ubi.city` | 删除 |

### 7.3 Route 53

[打开 `orbiter.finance` Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z04770142853ETHC27F9J)

待删除记录分组：

| 分组 | 记录 |
|---|---|
| EKS/nginx API | `api`、`blog`、`demo-api`、`openapi` |
| 外部 Istio | `bridge-api`、`router` |
| Official Bridge ALB | `bridgex-api`、`bridgex-test`、`testnet-api` |
| CloudFront/S3 | `cdn`、`get`、`whitepaper`、`testnet-cdn` |
| Amplify/前端 | 根域、`www`、`app`、`beta`、`bridge`、`static`、`test`、`testnet`、`bounty`、`explorer`、`goerli-explorer`、`indemnify`、`manta-reward`、`refund`、`tma`、`test-tma` |
| 明显遗留 | `goerli-submitter_rpc`、`iris_dashboard`、`l2api`、`logs`、`monitor`、`mq`、`nativeapi`、`pizza-api`、`rinkeby_dashboard`、`rpc-gateway`、`tma-api`、`tma-test-api` |

如果企业邮箱继续使用，必须保留：

- 根域 MX 记录。
- 根域 SPF TXT。
- `google._domainkey` DKIM TXT。
- Google Workspace 验证记录。
- `mail.orbiter.finance`，如果仍由邮件系统使用。

如果域名和邮箱都不再使用，删除所有业务记录后可最终删除 Hosted Zone；域名注册本身需要在 Route 53 Domains 或注册商处另行处理。

[打开 `orbk8s.com` Zone](https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones#ListRecordSets/Z01909693VMTQ0S20M3Y5)

删除候选：

- `router-internal.orbk8s.com`
- `jmsweb.orbk8s.com`

保留：

- `*.orbk8s.com`
- ACM 验证记录
- `hello.orbk8s.com` 在确认无 Token Boat/运维用途前暂不删除

## 8. 第五阶段：ECR、S3、CloudWatch、IAM 和遗留 Serverless

### 8.1 ECR

[打开东京 ECR](https://ap-northeast-1.console.aws.amazon.com/ecr/repositories/private/952178321851?region=ap-northeast-1)

保留：

- `token-boat`
- `token-boat-agent-api`

删除候选共 36 个，其中东京 35 个、Virginia 1 个。

Orbiter 仓库：

- `orbiter-finance/chain-rating-system`
- `orbiter-finance/explore-crawler`
- `orbiter-finance/monitoring-holders-obt`
- `orbiter-finance/metrics`
- `orbiter-finance/bridge-api`
- `orbiter-finance/explore-refinery`
- `orbiter-finance/maker-client`
- `orbiter-finance/dashboard`
- `orbiter-finance/task-platform`
- `orbiter-finance/liquidity-system`
- `orbiter-finance/token-rating-system`
- `orbiter-finance/partner-data-openness`
- `orbiter-finance/points-platform`
- `orbiter-finance/commissions`
- `orbiter-finance/market-exchange-rate`
- `orbiter-finance/builder`
- `orbiter-finance/active-platform`
- `orbiter-finance/openapi`
- `orbiter-finance/router-manager`
- `orbiter-finance/public-balances-api`
- `orbiter-finance/public-exchange-rate`
- `orbiter-finance/airdrop-api`
- `orbiter-finance/blog`

Official Bridge 和其他仓库：

- `official-bridge/event-indexer`
- `official-bridge/builder`
- `official-bridge/api-gateway`
- `official-bridge/event-processor-service`
- `official-bridge/relayer-service`
- `official-bridge/core-service`
- `official-bridge/dashboard-service`
- `bir-api`
- `bir-worker`
- `bir-kaniko-cache`
- `mammon-mini-api`
- `middleware/kubectl`
- Virginia：`aabank-telegram-server`

23 个 `orbiter-finance/*` 仓库镜像逻辑大小约 804 GiB。等所有 EKS/EC2/CI 部署确认停止后再删除仓库。

### 8.2 S3

[打开 S3 Bucket 列表](https://s3.console.aws.amazon.com/s3/buckets)

| Bucket | 当前大小/用途 | 处理 |
|---|---:|---|
| [`eks-loki-obt`](https://s3.console.aws.amazon.com/s3/buckets/eks-loki-obt?region=ap-northeast-1&tab=objects) | 约 652 GB，当前 Loki | **保留**；通过 Loki retention 清理旧 Orbiter 日志 |
| [`orbiter-velero-backups-tokyo`](https://s3.console.aws.amazon.com/s3/buckets/orbiter-velero-backups-tokyo?region=ap-northeast-1&tab=objects) | 约 782 MB，当前 Velero | **保留** |
| [`orbiter-bridge`](https://s3.console.aws.amazon.com/s3/buckets/orbiter-bridge?region=ap-northeast-1&tab=objects) | 约 577 MB，CloudFront Origin | CDN 删除后清空并删除 |
| [`get.orbiter.finance`](https://s3.console.aws.amazon.com/s3/buckets/get.orbiter.finance?region=ap-northeast-1&tab=objects) | CloudFront Origin | CloudFront 删除后删除 |
| [`whitepaper.orbiter.finance`](https://s3.console.aws.amazon.com/s3/buckets/whitepaper.orbiter.finance?region=ap-northeast-1&tab=objects) | 白皮书站点 | 归档后删除 |
| `dms-6u5kxhscxjae7krkobp2dcfh24` | 约 152 MB，DMS | DMS 删除后删除 |
| `dms-d6ucbog2bbekzrestgx7vg7uzkv6s72ggqck4cq` | DMS | DMS 删除后删除 |
| `eks-tempo-storage-obt` | 当前未发现有效引用 | 确认无 Tempo 后删除 |
| `velero-orbiter-k8s-backups` | 非当前 Velero BSL | 检查对象后删除 |
| `amplify-amplifyff7c00b2d3c64-staging-131402-deployment` | 旧 Amplify Backend | Stack 删除后删除 |
| `amplify-walletpolicy-staging-31438-deployment` | 旧 Amplify Backend | Stack 删除后删除 |
| `apissl` | 约 601 B | 删除 |
| `communityimage` | 约 1.7 MB | 归档后删除 |
| `makernode-systemmanager` | Maker 遗留 | Maker 下线后删除 |
| `minibank-server` | 约 93 MB | 所有者确认后删除 |
| `ortestapp` | 无明显当前用途 | 所有者确认后删除 |
| `ubicity-csv2dynamodb` | 约 158 MB | 归档后删除 |
| `ubicity-whitepaper` | 约 3.8 MB | 归档后删除 |
| `whitepaper.ubi.city` | CloudFront Origin | CloudFront 删除后删除 |
| `wenbo` | 约 222 MB | 所有者确认后删除 |

删除 Bucket 前检查：Versioning、Object Lock、Lifecycle、Replication、CloudFront Origin、Bucket Policy 和跨账号访问。启用 Versioning 的 Bucket 需要同时清理历史版本和 Delete Marker。

### 8.3 CloudWatch Logs

[打开日志组](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups)

主要清理对象：

| 日志组 | 已存储大小 | 处理 |
|---|---:|---|
| `/aws/amplify/ddwthojoyyc8q` | 约 32.7 GB | Amplify 删除后删除 |
| `/aws/amplify/d18y4hcr7cxd8q` | 约 17.8 GB | App 已不在当前列表，确认后删除 |
| `dms-tasks-orbiter-v3` | 约 4.6 GB | DMS 删除后删除 |
| 旧 `/aws/lambda/transfer*` | 单组约 0.7–0.8 GB | CloudFormation 删除后删除 |
| 旧 `/aws/lambda/ethdata*`、`airdrop*`、`luckyubi*` 等 | 多组 | CloudFormation 删除后删除 |
| `/aws/rds/instance/official-bridge-server/postgresql` | 约 57 MB | RDS 删除后删除 |
| `/aws/rds/instance/maker-explore-readonly/postgresql` | 约 159 MB | 只读库删除后删除 |
| `/aws/amazonmq/broker/b-5e7e2b55-4394-4e55-8187-109b6d16e2a5/*` | 约 165 MB | MQ 删除后删除 |
| `/aws/redshift/orbiter-sql/*` | 多组 | Redshift 删除后删除 |

保留 `/aws/eks/orbiter-finance/cluster`，但当前约 114.5 GB 且没有 retention。建议单独审批后将 retention 设置为 30–90 天，避免无限增长。

### 8.4 CloudFormation、DynamoDB、Lambda

[打开 CloudFormation](https://ap-northeast-1.console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks) · [打开 DynamoDB](https://ap-northeast-1.console.aws.amazon.com/dynamodbv2/home?region=ap-northeast-1#tables)

最近 30 天读写均为 0 的 DynamoDB：

- `AirdropStatistics`
- `AirdropStatistics1`
- `HelloWorldDatabase`
- `airdropAddress`
- `community`
- `crossChainTransfer`
- `depositedvalue`
- `eth2goNews`
- `luckyubi`

建议删除的旧 Stack：

- `helloworld1`、`one`、`two`
- `xyxdaiaddress`、`xdaiaddress`、`xdai`、`xdaiwater`
- `postinfo`、`uploadS3`、`depositedvalue`
- `ethdata`、`getPosterInfo`
- `airdropAddress`、`airdropStatistics`、`luckyubi`
- `transfercity`、`transferxcity`
- `transferbcre`、`transfercre`
- `transferfuse`、`transferbfuse`
- `aws-sam-cli-managed-default`
- `amplify-amplifyff7c00b2d3c64-staging-131402`
- `amplify-walletpolicy-staging-31438`

保留：

- `eksctl-orbiter-finance-addon-iamserviceaccount-velero-velero-server`
- `AWS-QuickSetup-SSM-LocalDeploymentRolesStack`
- `CDKToolkit`，至少等其他 CDK/CloudFormation 资源清理完成后再判断

优先删除 Stack，让 CloudFormation 按依赖关系删除 Lambda、API、IAM Role 和 DynamoDB。若 Stack 删除失败，再处理 Retain 资源或依赖阻塞。

### 8.5 IAM、Cognito、SNS 和告警

[IAM Roles](https://us-east-1.console.aws.amazon.com/iam/home#/roles) · [Cognito](https://ap-northeast-1.console.aws.amazon.com/cognito/v2/idp/user-pools?region=ap-northeast-1) · [CloudWatch Alarms](https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#alarmsV2:)

IAM 清理：

- 当前共有 37 个 `AmplifySSRLoggingRole-*`。
- 其中 19 个已不被任何现存 Amplify App 引用，可优先检查后删除。
- 其余 Orbiter Amplify App 关联 Role 随 App 下线清理。
- DMS/Redshift 删除后清理：
  - `dms-access-for-endpoint`
  - `dms-cloudwatch-logs-role`
  - `dms-vpc-role`
  - `AmazonRedshift-CommandsAccessRole-20240125T170715`
- Orbiter CI 下线后检查并删除 `jenkins-eks-deploy-role-orbiter`。
- 不要删除 `AmazonEKSAutoClusterRole`、`AmazonEKSAutoNodeRole`、EBS CSI Role、Velero Role 等当前 EKS Role。

Cognito 清理：

- 8 个 `amplify_backend_manager_*` User Pool。
- 8 个对应 Identity Pool。
- 当前没有 Token Boat Amplify App 使用这些 Pool。

SNS/告警清理：

- 删除 4 个旧 Amplify SNS Topic。
- DynamoDB 删除后删除 Topic `dynamodb` 和对应告警。
- 删除指向已不存在 EC2、RDS、API Gateway 的 `INSUFFICIENT_DATA` 告警。
- 保留两条 `maker-explore` 告警，以及它们仍使用的 `RDS_DB_Alert`、`Liang`、`Default_CloudWatch_Alarms_api` Topic。

### 8.6 Secrets Manager 和 FSx Backup

- [`sqlworkbench!...` Secret](https://ap-northeast-1.console.aws.amazon.com/secretsmanager/listsecrets?region=ap-northeast-1)：最后访问时间为 2024 年。确认 SQL Workbench 连接已废弃后，设置 7–30 天恢复窗口删除。
- FSx Backup `backup-072273bbb87eb60f3`：名称为“最终备份”。确认数据保留期限后删除。

## 9. 推荐执行窗口和顺序

### T-3 至 T-1 天：准备

- [ ] 发布 Orbiter 停服公告。
- [ ] 冻结 Orbiter、Official Bridge、Maker、10k、BIR 等项目部署。
- [ ] 导出 Amplify 配置，但不在普通文档中保存 Secret 值。
- [ ] 轮换已经暴露的 Amplify 凭据。
- [ ] 创建 RDS/Redshift 最终快照。
- [ ] 导出 DynamoDB 数据。
- [ ] 导出 RabbitMQ definitions 和用户权限。
- [ ] 导出 Consul KV snapshot。
- [ ] 确认 Velero 最新 Backup 为 `Completed`。

### T0：停止业务

- [ ] 停止 EKS `explore-prod` 中的 Orbiter Deployment/CronJob。
- [ ] 停止 5 台非 Token Boat EC2。
- [ ] 停止 DMS Tasks。
- [ ] 停止 Amplify/CloudFront 对外流量或切维护页。
- [ ] 删除/切换 Orbiter DNS 记录。
- [ ] 观察 Token Boat 错误率、DB、Redis、Ingress 和节点状态。

### T+1 至 T+3 天：永久删除业务资源

- [ ] 删除 EKS Orbiter Helm Release、namespace 和 Consul。
- [ ] Terminate 5 台 EC2，并释放 EIP/EBS。
- [ ] 删除 `maker-explore-readonly`、`official-bridge-server`。
- [ ] 删除 Amazon MQ。
- [ ] 删除 DMS 和 Redshift。
- [ ] 删除 27 个非 Token Boat Amplify App。
- [ ] Disable 并删除 5 个 CloudFront Distribution。

### T+3 至 T+7 天：清理依赖和账单尾项

- [ ] 删除 ECR、S3、WAF、IAM、Cognito、日志组和告警。
- [ ] 删除空闲 VPC、NAT、Endpoint、EIP 和安全组。
- [ ] 清理 Route 53 遗留记录。
- [ ] 检查所有 Region 的未关联 EIP、EBS、Snapshot 和 Load Balancer。
- [ ] 用 Cost Explorer 按 Service/Usage Type 检查残余收费。

## 10. 回滚方案

| 阶段 | 回滚方法 |
|---|---|
| EC2 Stop 阶段 | 重新 Start 原实例，EIP 不提前释放 |
| EKS Scale/停止阶段 | 恢复 Deployment replica 或重新安装原 Helm Release |
| DNS 切换 | 将原 Route 53 记录恢复到原 LB/CloudFront；提前降低 TTL |
| RDS 删除后 | 从最终 Snapshot 恢复新实例，并更新连接地址 |
| Redshift 删除后 | 从最终 Manual Snapshot 恢复 |
| MQ 删除后 | 新建 RabbitMQ Broker，导入 definitions/users/policies |
| Amplify 删除后 | 从 Git 仓库重新创建 App，恢复已安全保存的构建配置和 Secret |
| DynamoDB 删除后 | 从 Export/PITR 恢复；删除前必须验证备份可用 |
| S3 删除后 | 只能从外部备份恢复；Bucket 清空前必须完成归档 |

不可逆操作包括：释放 EIP、删除没有快照的 EBS、清空无版本控制的 S3、删除未导出的 MQ/DynamoDB 数据。应放在观察期结束后执行。

## 11. 验收标准

### Token Boat 功能验收

- [ ] `tokenboat.com`、Agent 和 API Docs 正常访问。
- [ ] Token Boat API 请求成功率和延迟没有异常。
- [ ] Token Boat 能正常连接 `maker-explore`。
- [ ] Token Boat 能正常连接 Redis `172.31.15.167`。
- [ ] Worker、Master、Agent API Pod 均为 Ready。
- [ ] nginx/Istio 入口没有明显 4xx/5xx 增长。
- [ ] Prometheus、Grafana、Loki 和 Alertmanager 正常。
- [ ] Velero 最新定时备份正常完成。

### Orbiter 下线验收

- [ ] EKS 中没有 Orbiter Pod、CronJob、Ingress 和 Service。
- [ ] 5 台非 Token Boat EC2 已终止。
- [ ] Official Bridge RDS 和 MQ 已删除。
- [ ] DMS Task、Replication Instance 和 Redshift 已删除。
- [ ] 27 个非 Token Boat Amplify App 已删除。
- [ ] 5 个 CloudFront Distribution 已删除。
- [ ] 36 个非 Token Boat ECR 仓库已删除或设置明确保留策略。
- [ ] Orbiter DNS 记录、WAF、证书、日志和 IAM Role 无残留。
- [ ] 空闲 VPC `vpc-02dcfef555a661b85` 已删除。

### 成本验收

- [ ] Amazon MQ 不再产生费用。
- [ ] Redshift 和 DMS 不再产生费用。
- [ ] Amplify/WAF/ECR 费用显著下降。
- [ ] ELB 数量由 10 个下降到 2 个左右。
- [ ] VPC Endpoint 和旧 NAT 费用消失。
- [ ] RDS 费用只保留 `maker-explore` 及其必要备份。
- [ ] EC2 费用只保留 Token Boat、当前 EKS 和明确批准的其他资源。
- [ ] 一周后 Cost Explorer 显示月度 Run Rate 下降约 `$2,500–$3,500`。

## 12. 权限和审计限制

当前审计账号对以下 API 权限有限：

- `lambda:ListFunctions`
- `mq:ListBrokers`
- `elasticache:Describe*`
- `fsx:Describe*`
- `directconnect:Describe*`
- 部分 `cloudformation:ListStackResources`
- 部分 NAT、Route Table 和 VPC Peering 查询

本报告通过 Cost Explorer、CloudWatch 指标、资源标签、日志组和可访问的 Describe API 做了交叉验证。正式永久删除前，拥有管理员权限的执行人应在对应管理页面再次核对关联资源和最近使用时间。

## 13. 最终审批记录

| 角色 | 姓名 | 决策/签字 | 日期 |
|---|---|---|---|
| 业务负责人 |  |  |  |
| AWS 管理员 |  |  |  |
| Token Boat 负责人 |  |  |  |
| 数据负责人 |  |  |  |
| 安全负责人 |  |  |  |

