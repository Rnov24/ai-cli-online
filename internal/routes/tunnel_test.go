package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huacheng/agy-online/internal/config"
	"github.com/huacheng/agy-online/internal/tunnel"
)

func TestTunnelHandler_GetStatus_Unauthorized(t *testing.T) {
	auth := NewAuthHelper(&config.Config{AuthToken: "secret-token"})
	mgr := tunnel.NewManager()
	h := NewTunnelHandler(auth, mgr, 3001)

	req := httptest.NewRequest("GET", "/api/tunnel/status", nil)
	w := httptest.NewRecorder()

	h.GetStatus(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestTunnelHandler_GetStatus_Authorized(t *testing.T) {
	auth := NewAuthHelper(&config.Config{AuthToken: "secret-token"})
	mgr := tunnel.NewManager()
	h := NewTunnelHandler(auth, mgr, 3001)

	req := httptest.NewRequest("GET", "/api/tunnel/status", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	w := httptest.NewRecorder()

	h.GetStatus(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var status tunnel.TunnelStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("failed to parse status JSON: %v", err)
	}
	if status.Running {
		t.Fatal("expected status.Running to be false")
	}
}

func TestTunnelHandler_Start_NotInstalled(t *testing.T) {
	auth := NewAuthHelper(&config.Config{})
	// Manager with empty non-existent dir
	emptyDir := filepath.Join(os.TempDir(), "empty-tunnel-dir-none")
	mgr := tunnel.NewManager(emptyDir)
	h := NewTunnelHandler(auth, mgr, 3001)

	body := strings.NewReader(`{"mode":"quick"}`)
	req := httptest.NewRequest("POST", "/api/tunnel/start", body)
	w := httptest.NewRecorder()

	h.Start(w, req)
	// If cloudflared is not in PATH, should return 400
	if !mgr.Status().Installed {
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when not installed, got %d", w.Code)
		}
	}
}

func TestTunnelHandler_Stop_Success(t *testing.T) {
	auth := NewAuthHelper(&config.Config{})
	mgr := tunnel.NewManager()
	h := NewTunnelHandler(auth, mgr, 3001)

	req := httptest.NewRequest("POST", "/api/tunnel/stop", nil)
	w := httptest.NewRecorder()

	h.Stop(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
