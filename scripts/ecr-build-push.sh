#!/usr/bin/env bash

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-952178321851}"
ECR_REPOSITORY="${ECR_REPOSITORY:-token-boat}"
BUILDX_BUILDER="${BUILDX_BUILDER:-token-boat-ecr-push}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.ecr}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"

for command_name in aws docker git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "error: required command not found: $command_name" >&2
    exit 1
  fi
done

project_root="$(git rev-parse --show-toplevel)"
cd "$project_root"

image_tag="${1:-$(git rev-parse --short=9 HEAD)}"
if [[ ! "$image_tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo "error: invalid Docker image tag: $image_tag" >&2
  exit 1
fi

current_account="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$current_account" != "$AWS_ACCOUNT_ID" ]]; then
  echo "error: AWS account mismatch: expected $AWS_ACCOUNT_ID, got $current_account" >&2
  exit 1
fi

registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image="${registry}/${ECR_REPOSITORY}:${image_tag}"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$registry"

if ! docker buildx inspect "$BUILDX_BUILDER" >/dev/null 2>&1; then
  docker buildx create \
    --name "$BUILDX_BUILDER" \
    --driver docker-container \
    --use
fi

docker buildx build \
  --builder "$BUILDX_BUILDER" \
  --platform "$TARGET_PLATFORM" \
  --file "$DOCKERFILE" \
  --tag "$image" \
  --push \
  .

digest=""
for _ in {1..10}; do
  digest="$(aws ecr describe-images \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-ids "imageTag=$image_tag" \
    --query 'imageDetails[0].imageDigest' \
    --output text 2>/dev/null || true)"
  if [[ "$digest" == sha256:* ]]; then
    break
  fi
  sleep 2
done

if [[ "$digest" != sha256:* ]]; then
  echo "error: image was pushed but its ECR digest could not be resolved" >&2
  exit 1
fi

echo "pushed: $image"
echo "immutable: ${registry}/${ECR_REPOSITORY}@${digest}"
