# token-boat single-node Redis

This deployment runs a pinned Redis image on EC2 with ACL authentication, AOF and RDB persistence, a host bind mount, a health check, resource limits, log rotation, and automatic restart.

- Host port: `8839`
- Container port: `6379`
- Persistent data: `/opt/token-boat/redis/data`
- Runtime configuration: `/opt/token-boat/redis/conf/redis.conf`
- Root-only credentials: `/opt/token-boat/redis/secrets/credentials`

The bind mount survives container replacement. It does not protect against EC2 root-volume loss or instance deletion; use encrypted EBS snapshots or a separate encrypted data volume for that failure mode.

Redis protocol traffic on port `8839` is not TLS-encrypted. If public access is enabled, restrict the EC2 security-group source to a trusted `/32` address whenever possible.
