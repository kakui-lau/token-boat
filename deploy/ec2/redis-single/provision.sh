#!/usr/bin/env bash
set -Eeuo pipefail

readonly INSTALL_DIR=/opt/token-boat/redis
readonly REDIS_IMAGE=redis:8.10.1-trixie@sha256:298e5b3bc566bade82f46ad5511777a4a07a294097ce16ada2f6a42be5239df5
readonly COMPOSE_VERSION=v5.5.1
readonly COMPOSE_ASSET=docker-compose-linux-aarch64

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

dnf install -y docker openssl
systemctl enable --now docker

install -d -m 0755 /usr/local/lib/docker/cli-plugins
curl -fsSL --retry 3 \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/${COMPOSE_ASSET}" \
  -o "${temp_dir}/${COMPOSE_ASSET}"
curl -fsSL --retry 3 \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/${COMPOSE_ASSET}.sha256" \
  -o "${temp_dir}/${COMPOSE_ASSET}.sha256"
(
  cd "$temp_dir"
  sha256sum --check "${COMPOSE_ASSET}.sha256"
)
install -m 0755 "${temp_dir}/${COMPOSE_ASSET}" /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

docker pull "$REDIS_IMAGE"
redis_uid="$(docker run --rm --entrypoint id "$REDIS_IMAGE" -u redis)"
redis_gid="$(docker run --rm --entrypoint id "$REDIS_IMAGE" -g redis)"

install -d -m 0755 /opt/token-boat
install -d -m 0750 "$INSTALL_DIR" "$INSTALL_DIR/conf"
install -d -o "$redis_uid" -g "$redis_gid" -m 0750 "$INSTALL_DIR/data" "$INSTALL_DIR/secrets"
install -m 0644 "$source_dir/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
install -m 0644 "$source_dir/redis.conf" "$INSTALL_DIR/conf/redis.conf"
install -m 0644 "$source_dir/99-redis.conf" /etc/sysctl.d/99-redis.conf
install -m 0644 "$source_dir/disable-thp.service" /etc/systemd/system/disable-thp.service

if [[ ! -s "$INSTALL_DIR/secrets/credentials" ]]; then
  app_password="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -hex 32)"
  health_password="$(openssl rand -hex 32)"
  app_hash="$(printf '%s' "$app_password" | sha256sum | awk '{print $1}')"
  admin_hash="$(printf '%s' "$admin_password" | sha256sum | awk '{print $1}')"
  health_hash="$(printf '%s' "$health_password" | sha256sum | awk '{print $1}')"

  printf '%s\n' \
    'user default off' \
    "user tokenboat on #${app_hash} ~* &* +@all -flushall -flushdb -shutdown -config -module -acl" \
    "user tokenboat-admin on #${admin_hash} ~* &* +@all" \
    "user health on #${health_hash} -@all +ping" \
    > "$INSTALL_DIR/secrets/users.acl"
  printf '%s' "$health_password" > "$INSTALL_DIR/secrets/health_password"
  printf 'REDIS_USERNAME=tokenboat\nREDIS_PASSWORD=%s\nREDIS_ADMIN_USERNAME=tokenboat-admin\nREDIS_ADMIN_PASSWORD=%s\n' \
    "$app_password" "$admin_password" > "$INSTALL_DIR/secrets/credentials"
fi

printf 'REDIS_UID=%s\nREDIS_GID=%s\n' "$redis_uid" "$redis_gid" > "$INSTALL_DIR/.env"
chown "$redis_uid:$redis_gid" "$INSTALL_DIR/data" "$INSTALL_DIR/secrets" \
  "$INSTALL_DIR/secrets/users.acl" "$INSTALL_DIR/secrets/health_password"
chmod 0750 "$INSTALL_DIR/data" "$INSTALL_DIR/secrets"
chmod 0400 "$INSTALL_DIR/secrets/users.acl" "$INSTALL_DIR/secrets/health_password"
chown root:root "$INSTALL_DIR/secrets/credentials" "$INSTALL_DIR/.env"
chmod 0600 "$INSTALL_DIR/secrets/credentials" "$INSTALL_DIR/.env"

sysctl --system >/dev/null
systemctl daemon-reload
systemctl enable --now disable-thp.service

if id ec2-user >/dev/null 2>&1; then
  usermod -aG docker ec2-user
fi

cd "$INSTALL_DIR"
docker compose config --quiet
docker compose up -d --remove-orphans

for _ in $(seq 1 60); do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' token-boat-redis 2>/dev/null || true)"
  if [[ "$health_status" == healthy ]]; then
    break
  fi
  sleep 2
done

if [[ "${health_status:-}" != healthy ]]; then
  docker compose ps
  docker compose logs --tail 100 redis
  exit 1
fi

# Verify application credentials and persistence without printing either password.
app_password="$(awk -F= '$1 == "REDIS_PASSWORD" {print $2}' "$INSTALL_DIR/secrets/credentials")"
docker exec -e REDISCLI_AUTH="$app_password" token-boat-redis \
  redis-cli --user tokenboat --no-auth-warning set token-boat:deployment-check ok >/dev/null
docker restart token-boat-redis >/dev/null

for _ in $(seq 1 60); do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' token-boat-redis 2>/dev/null || true)"
  if [[ "$health_status" == healthy ]]; then
    break
  fi
  sleep 2
done

if [[ "$health_status" != healthy ]]; then
  docker compose logs --tail 100 redis
  exit 1
fi

persisted_value="$(docker exec -e REDISCLI_AUTH="$app_password" token-boat-redis \
  redis-cli --user tokenboat --no-auth-warning --raw get token-boat:deployment-check)"
if [[ "$persisted_value" != ok ]]; then
  echo "Redis persistence verification failed." >&2
  exit 1
fi
docker exec -e REDISCLI_AUTH="$app_password" token-boat-redis \
  redis-cli --user tokenboat --no-auth-warning del token-boat:deployment-check >/dev/null

docker compose ps
echo "Redis deployment and persistence checks passed."
echo "Credentials: $INSTALL_DIR/secrets/credentials (root-only)"
echo "Data: $INSTALL_DIR/data"
