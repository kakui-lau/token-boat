package common

// ShouldRunStartupMigrations reports whether this process may apply schema or
// one-time data migrations during application startup. Production Helm pods
// disable this and use the explicit db-migrate command before deployment.
func ShouldRunStartupMigrations() bool {
	return IsMasterNode && !GetEnvOrDefaultBool("SKIP_DB_MIGRATION", false)
}
