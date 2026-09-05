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

	// 6. Turn Journal Endpoints
	chatH := NewChatHandler(auth, database)

	// Pre-populate an interrupted turn in DB
	sessId := "tab-1"
	sessName := auth.ResolveSession(httptest.NewRecorder(), req, sessId)
	_ = database.CreateTurnJournal(db.TurnJournalEntry{
		Id:             "test-turn-1",
		SessionName:    sessName,
		ConversationId: "conv-1",
		Prompt:         "Hello Antigravity",
		Status:         "running",
	})

	// Recover endpoint
	req = httptest.NewRequest(http.MethodPost, "/api/sessions/tab-1/journal/recover", nil)
	req.SetPathValue("sessionId", "tab-1")
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	chatH.RecoverSessionJournal(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 recovering journal, got %d", w.Code)
	}
	var recResp map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &recResp)
	if recResp["recovered"].(float64) < 1 {
		t.Errorf("Expected at least 1 recovered turn, got %v", recResp["recovered"])
	}

	// Get journal endpoint
	req = httptest.NewRequest(http.MethodGet, "/api/sessions/tab-1/journal", nil)
	req.SetPathValue("sessionId", "tab-1")
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	chatH.GetSessionJournal(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 getting journal, got %d", w.Code)
	}
	var journalResp struct {
		Ok    bool                 `json:"ok"`
		Turns []db.TurnJournalEntry `json:"turns"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &journalResp)
	if !journalResp.Ok || len(journalResp.Turns) != 1 {
		t.Fatalf("Expected 1 turn in journal, got %+v", journalResp)
	}
	if journalResp.Turns[0].Status != "interrupted" {
		t.Errorf("Expected turn status to be 'interrupted', got %s", journalResp.Turns[0].Status)
	}
}

