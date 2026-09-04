package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/idle"
)

func TestRoutes(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "ai-cli-routes-test-*")
	defer os.RemoveAll(tempDir)

	database, _ := db.Open(tempDir)
	defer database.Close()

	idle.Init(nil)

	cfg := &config.Config{
		AuthToken:         "test-secret",
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	setH := NewSettingsHandler(auth, database)

	// 1. Health check
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	HandleHealth(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// 2. System status
	w = httptest.NewRecorder()
	HandleSystemStatus(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
	var status SystemStatusResponse
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("Failed to parse status response: %v", err)
	}
	if status.Server.Pid <= 0 {
		t.Errorf("Expected positive PID, got %d", status.Server.Pid)
	}

	// 3. Auth verify unauthorized
	req = httptest.NewRequest(http.MethodGet, "/api/auth/verify", nil)
	w = httptest.NewRecorder()
	auth.HandleVerify(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 unauthorized, got %d", w.Code)
	}

	// 4. Auth verify authorized
	req = httptest.NewRequest(http.MethodGet, "/api/auth/verify", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	auth.HandleVerify(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 authorized, got %d", w.Code)
	}

	// 5. Settings with auth
	saveBody, _ := json.Marshal(map[string]string{"value": "light"})
	req = httptest.NewRequest(http.MethodPut, "/api/settings/theme", bytes.NewReader(saveBody))
	req.SetPathValue("key", "theme")
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	setH.SaveSetting(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 saving setting, got %d", w.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/settings/theme", nil)
	req.SetPathValue("key", "theme")
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	setH.GetSetting(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 getting setting, got %d", w.Code)
	}
	var getResp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &getResp)
	if getResp["value"] != "light" {
		t.Errorf("Expected theme 'light', got %v", getResp["value"])
	}
}
