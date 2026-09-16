# token-boat Helm deployment

This chart is the source of truth for `token-boat` on the EKS Auto Mode cluster
named `token-boat`. It deploys ARM64 worker pods, autoscaling, disruption
protection, an EKS Auto Mode ALB canary ingress, and an optional singleton
master. Runtime credentials are deliberately not stored in the chart.

## Prerequisites

- `kubectl` context: `token-boat`
- namespace from `bootstrap/namespace.yaml`
- existing Secret `token-boat-runtime` in `token-boat-prod`
- ECR image digest and ACM certificate configured in `values.yaml`
- external-dns running in its own namespace

Create only the non-secret namespace bootstrap resource:

```bash
kubectl --context token-boat apply -f deploy/helm/token-boat/bootstrap/namespace.yaml
```

Verify the externally managed Secret without printing its values:

```bash
kubectl --context token-boat -n token-boat-prod get secret token-boat-runtime
```

## Validate and deploy

```bash
helm lint deploy/helm/token-boat
helm template token-boat deploy/helm/token-boat \
  --namespace token-boat-prod \
  | kubectl --context token-boat apply --dry-run=server -f -

helm upgrade --install token-boat deploy/helm/token-boat \
  --kube-context token-boat \
  --namespace token-boat-prod \
  --take-ownership \
  --atomic \
  --timeout 20m
```

`--take-ownership` is required for the first Helm install because the worker,
Service, HPA, PDB, ServiceAccount, and NodePool were initially created as plain
Kubernetes manifests. Later upgrades do not need that option.

Run the read-only PostgreSQL/Redis readiness test and check the rollout:

```bash
helm --kube-context token-boat test token-boat \
  --namespace token-boat-prod \
  --timeout 10m

kubectl --context token-boat -n token-boat-prod \
  logs job/token-boat-preflight

kubectl --context token-boat -n token-boat-prod \
  rollout status deployment/token-boat-worker --timeout=20m

kubectl --context token-boat -n token-boat-prod get \
  deploy,pod,svc,hpa,pdb,ingress
```

The canary host is `https://eks-canary.tokenboat.com`. The same Ingress also
accepts the production hostnames. Production DNS already targets this ALB and
must remain unchanged during normal releases and rollbacks.

## Release a new image

Build and push the ARM64 image, then deploy its immutable digest with the legacy
public shell selected for the first rollout:

The publish script intentionally refuses a dirty worktree so the image tag
always identifies the exact committed source.

```bash
./scripts/ecr-build-push.sh

helm upgrade token-boat deploy/helm/token-boat \
  --kube-context token-boat \
  --namespace token-boat-prod \
  --set-string image.digest=sha256:REPLACE_WITH_DIGEST \
  --set-string worker.publicSiteMode=legacy \
  --atomic \
  --timeout 20m
```

After validating the API, `/console/*`, `/dashboard/*`, authentication, and
pricing through the canary host, enable the new public site without changing the
image:

```bash
helm upgrade token-boat deploy/helm/token-boat \
  --kube-context token-boat \
  --namespace token-boat-prod \
  --reuse-values \
  --set-string worker.publicSiteMode=new \
  --atomic \
  --timeout 20m
```

`worker.publicSiteMode` is rendered only into the worker Deployment, so changing
it does not restart the singleton master. After validation, persist the image
digest and selected mode in `values.yaml` so the repository remains the source
of truth.

The shipped web routing is:

- `/` and public content: new Astro site;
- `/console/*`: new User Console;
- `/dashboard/*`: legacy compatibility dashboard, available by direct URL to any signed-in user;
  administrator-only sections and actions retain their role and permission checks;
- `/admin/*`: not shipped while Admin V2 is under development.

Keep `FRONTEND_BASE_URL` empty for this embedded layout. A non-empty value makes
worker nodes redirect all web paths to that external frontend instead.

To roll back only the public site without replacing the image, retain the live
release values and change only the mode:

```bash
helm upgrade token-boat deploy/helm/token-boat \
  --kube-context token-boat \
  --namespace token-boat-prod \
  --reuse-values \
  --set-string worker.publicSiteMode=legacy \
  --atomic \
  --timeout 20m
```

Run the same command with `worker.publicSiteMode=new` to restore the new public
site. This switch never changes `/console/*` or `/dashboard/*`, and it does not
restart the master.

To roll back the entire application, first identify the last known-good release
and then restore that Helm revision:

```bash
helm --kube-context token-boat history token-boat \
  --namespace token-boat-prod

helm rollback token-boat PREVIOUS_REVISION \
  --kube-context token-boat \
  --namespace token-boat-prod \
  --wait \
  --timeout 20m
```

There must be only one active master because it performs scheduled and singleton
work. Image rollout and rollback are managed by Helm using immutable ECR
digests. Do not change Route 53 as a release or rollback action: the retired DNS
target is no longer a valid fallback. Database schema changes must remain
backward compatible across the Helm rollback window.

## Trusted proxies

The production ALB uses IP targets and reaches workers from the three public
subnets declared in `ingress.class.subnetIds`. Their verified CIDRs are
`192.168.0.0/20`, `192.168.16.0/20`, and `192.168.32.0/20`; `TRUSTED_PROXIES` is
set to exactly those ranges. If the ALB subnet IDs change, verify their current
CIDRs in EC2 and update `TRUSTED_PROXIES` in the same release. Do not replace the
list with the entire VPC range.

## CloudWatch container logs

Production uses the AWS-managed `amazon-cloudwatch-observability` EKS add-on.
Its checked-in configuration is
`deploy/aws/cloudwatch-observability-values.json`. It keeps infrastructure
metrics enabled, sends application logs through Fluent Bit only, and limits
application-log ingestion to the `token-boat-prod` namespace. Successful
health-probe requests are dropped before CloudWatch ingestion; failed probes,
API requests, errors, billing events, host logs, and dataplane logs remain. The
application log output uses Fluent Bit's `log_key`, so CloudWatch `@message`
contains the application line directly instead of the Kubernetes JSON wrapper.

The add-on uses the `cloudwatch-agent` service account through EKS Pod Identity
and the IAM role `TokenBoatCloudWatchObservabilityRole`. That role has the AWS
managed `CloudWatchAgentServerPolicy`; no application credentials belong in
this file or the Helm release.

Reapply the versioned add-on configuration after a cluster rebuild or add-on
upgrade:

```bash
aws eks update-addon \
  --cluster-name token-boat \
  --region ap-northeast-1 \
  --addon-name amazon-cloudwatch-observability \
  --configuration-values file://deploy/aws/cloudwatch-observability-values.json \
  --resolve-conflicts PRESERVE

aws eks describe-addon \
  --cluster-name token-boat \
  --region ap-northeast-1 \
  --addon-name amazon-cloudwatch-observability \
  --query 'addon.{status:status,issues:health.issues}'
```

Application logs are available in
`/aws/containerinsights/token-boat/application`. The application, dataplane,
host, and performance log groups use a 30-day retention policy. Retention is a
CloudWatch log-group setting and must be reapplied if the groups are recreated.

## One-time stale ingress cleanup

The initial non-Helm test created `token-boat-canary`, `token-boat-public`, and a
partial ALB named `token-boat-public`. They are not used by this release. The EKS
Auto Mode cluster role currently cannot remove the old security-group tags, so do
not start this cleanup until that role has `ec2:DeleteTags` for the affected
security group.

After the permission is added, remove only the stale v1 resources and wait for
the Ingress finalizer before deleting its class:

```bash
kubectl --context token-boat -n token-boat-prod delete ingress token-boat-canary
kubectl --context token-boat -n token-boat-prod wait \
  --for=delete ingress/token-boat-canary --timeout=10m
kubectl --context token-boat delete ingressclass token-boat-public
kubectl --context token-boat delete ingressclassparams token-boat-public
```

Do not delete the `-v2` resources; those belong to the Helm release.

## Secrets

Do not commit `SQL_DSN`, `REDIS_CONN_STRING`, `SESSION_SECRET`, or
`CRYPTO_SECRET`. The chart references `token-boat-runtime`; secret rotation and
creation are managed separately.
