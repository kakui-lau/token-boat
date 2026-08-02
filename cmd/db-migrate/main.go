package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/joho/godotenv"
)

const migrationConfirmation = "MIGRATE"

func main() {
	envFile := strings.TrimSpace(os.Getenv("DB_MIGRATION_ENV_FILE"))
	confirmed := os.Getenv("DB_MIGRATION_CONFIRM") == migrationConfirmation
	if envFile == "" {
		log.Fatal("DB_MIGRATION_ENV_FILE is required; point it to the environment file for the target database")
	}
	envValues, err := godotenv.Read(envFile)
	if err != nil {
		log.Fatalf("read migration environment file: %v", err)
	}
	dsn := strings.TrimSpace(envValues["SQL_DSN"])
	if dsn == "" {
		dsn = strings.TrimSpace(envValues["DATABASE_URL"])
	}
	if dsn == "" {
		log.Fatal("SQL_DSN or DATABASE_URL must be set in the migration environment file")
	}
	if err := godotenv.Overload(envFile); err != nil {
		log.Fatalf("load migration environment file: %v", err)
	}
	if err := os.Setenv("SQL_DSN", dsn); err != nil {
		log.Fatalf("set SQL_DSN from migration environment file: %v", err)
	}
	if _, exists := envValues["LOG_SQL_DSN"]; !exists {
		if err := os.Unsetenv("LOG_SQL_DSN"); err != nil {
			log.Fatalf("clear ambient LOG_SQL_DSN: %v", err)
		}
	}
	if !confirmed {
		log.Fatalf("refusing to migrate %s; set DB_MIGRATION_CONFIRM=%s after verifying the target", migrationTarget(dsn), migrationConfirmation)
	}

	// Connections are opened without implicit startup migrations. The explicit
	// call below is the only migration entry point in this process.
	if err := os.Setenv("SKIP_DB_MIGRATION", "true"); err != nil {
		log.Fatalf("disable implicit database migration: %v", err)
	}
	common.InitEnv()
	logger.SetupLogger()

	common.SysLog("confirmed migration target: " + migrationTarget(dsn))
	if err := model.InitDB(); err != nil {
		log.Fatalf("initialize primary database: %v", err)
	}
	defer func() {
		if err := model.CloseDB(); err != nil {
			common.SysError("close database: " + err.Error())
		}
	}()
	if err := model.InitLogDB(); err != nil {
		log.Fatalf("initialize log database: %v", err)
	}
	if err := model.RunDatabaseMigrations(); err != nil {
		log.Fatalf("database migration failed: %v", err)
	}
	if err := model.MigrateRetiredFrontendOptions(); err != nil {
		log.Fatalf("frontend option migration failed: %v", err)
	}
	// The application initializes the enforcer on every pod, but production
	// pods skip its built-in role/policy seed. Temporarily enable that seed in
	// this explicit migration process after the required tables exist.
	if err := os.Setenv("SKIP_DB_MIGRATION", "false"); err != nil {
		log.Fatalf("enable authorization data migration: %v", err)
	}
	common.IsMasterNode = true
	if err := authz.Init(model.DB); err != nil {
		log.Fatalf("authorization data migration failed: %v", err)
	}
}

func migrationTarget(dsn string) string {
	parsed, err := url.Parse(dsn)
	if err == nil && parsed.Host != "" {
		database := strings.TrimPrefix(parsed.Path, "/")
		if database == "" {
			database = "(default database)"
		}
		return fmt.Sprintf("%s/%s", parsed.Host, database)
	}
	return "configured database"
}
