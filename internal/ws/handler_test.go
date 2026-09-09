package ws

import (
	"testing"

	"github.com/huacheng/agy-online/internal/config"
)

func TestHubSessionManagement(t *testing.T) {
	cfg := &config.Config{MaxConnections: 10}
	hub := InitHub(cfg)

	if hub == nil {
		t.Fatal("Expected non-nil hub")
	}

	sessionName := "test-session-close"
	if hub.HasActiveConnection(sessionName) {
		t.Errorf("Expected session %s to not be active initially", sessionName)
	}

	// CloseSession on non-existent connection should not panic
	hub.CloseSession(sessionName)
}
