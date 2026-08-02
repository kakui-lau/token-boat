package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMigrationTargetDoesNotExposeCredentials(t *testing.T) {
	target := migrationTarget("postgresql://migration-user:super-secret@db.example.com:5432/token-boat?sslmode=require")

	assert.Equal(t, "db.example.com:5432/token-boat", target)
	assert.NotContains(t, target, "migration-user")
	assert.NotContains(t, target, "super-secret")
}
