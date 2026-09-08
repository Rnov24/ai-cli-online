package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/idle"
	"github.com/huacheng/ai-cli-online/internal/terminal"
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
	sysH := NewSystemHandler(auth)

	// 1. Health check
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	HandleHealth(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	// 2. System routes auth checks
	// 2a. System status unauthorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/status", nil)
	w = httptest.NewRecorder()
	sysH.HandleSystemStatus(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 unauthorized for status, got %d", w.Code)
	}

	// 2b. System processes unauthorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/processes", nil)
	w = httptest.NewRecorder()
	sysH.HandleProcessList(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 unauthorized for processes, got %d", w.Code)
	}

	// 2c. System logs unauthorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/logs", nil)
	w = httptest.NewRecorder()
	sysH.HandleSystemLogs(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 unauthorized for logs, got %d", w.Code)
	}

	// 2d. System status authorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/status", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	sysH.HandleSystemStatus(w, req)
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

	// 2e. System processes authorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/processes", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	sysH.HandleProcessList(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for processes, got %d", w.Code)
	}

	// 2f. System logs authorized
	req = httptest.NewRequest(http.MethodGet, "/api/system/logs", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	w = httptest.NewRecorder()
	sysH.HandleSystemLogs(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for logs, got %d", w.Code)
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


func TestWriteFileContent_PathValidation(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-editor-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	siblingDir, err := os.MkdirTemp("", "ai-cli-editor-sibling-*")
	if err != nil {
		t.Fatalf("Failed to create sibling dir: %v", err)
	}
	defer os.RemoveAll(siblingDir)

	siblingFile := filepath.Join(siblingDir, "sibling.txt")
	_ = os.WriteFile(siblingFile, []byte("sibling content"), 0644)

	cfg := &config.Config{
		AuthToken:         "test-secret",
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	editH := NewEditorHandler(auth, nil)

	// Test writing outside cwd via ".." and sibling directory paths returns HTTP 403
	badPaths := []string{
		"../escape.txt",
		"../../etc/passwd",
		filepath.Join(tempDir, "..", "outside.txt"),
		siblingFile,
	}

	for _, badPath := range badPaths {
		body, _ := json.Marshal(map[string]string{
			"path":    badPath,
			"content": "malicious content",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/sessions/tab-1/file-content", bytes.NewReader(body))
		req.SetPathValue("sessionId", "tab-1")
		req.Header.Set("Authorization", "Bearer test-secret")
		w := httptest.NewRecorder()

		editH.WriteFileContent(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("Path %q: expected 403 Forbidden, got %d (body: %s)", badPath, w.Code, w.Body.String())
		}
		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "access denied: path outside workspace" {
			t.Errorf("Path %q: expected error 'access denied: path outside workspace', got %v", badPath, resp["error"])
		}
	}

	// Test writing to a valid file inside cwd succeeds
	validFile := filepath.Join(tempDir, "valid.txt")
	_ = os.WriteFile(validFile, []byte("original"), 0644)

	body, _ := json.Marshal(map[string]string{
		"path":    "valid.txt",
		"content": "updated content",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/sessions/tab-1/file-content", bytes.NewReader(body))
	req.SetPathValue("sessionId", "tab-1")
	req.Header.Set("Authorization", "Bearer test-secret")
	w := httptest.NewRecorder()

	editH.WriteFileContent(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 for valid file inside cwd, got %d (body: %s)", w.Code, w.Body.String())
	}
	data, _ := os.ReadFile(validFile)
	if string(data) != "updated content" {
		t.Errorf("Expected 'updated content', got %q", string(data))
	}
	var writeResp struct {
		Ok    bool    `json:"ok"`
		Mtime float64 `json:"mtime"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &writeResp)
	if !writeResp.Ok || writeResp.Mtime <= 0 {
		t.Errorf("Expected ok=true and positive mtime, got %+v", writeResp)
	}
}

func TestKillSession_Cascade(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-killsess-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := db.Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}
	defer database.Close()

	cfg := &config.Config{
		AuthToken:         "test-secret",
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	autoH := NewTaskAutoHandler(auth, database)
	sessH := NewSessionHandler(auth, database, autoH)

	sessionId := "sess-kill"
	sessionName := terminal.BuildSessionName("test-secret", sessionId)
	taskDirKill := filepath.Join(tempDir, "AiTasks", "kill-task")
	_ = os.MkdirAll(taskDirKill, 0755)

	_ = database.SaveDraft(sessionName, "test draft content")
	_ = database.SaveAnnotation(sessionName, filepath.Join(tempDir, "sample.md"), `{"ann":1}`, 12345)
	_ = database.UpsertTaskAuto(&db.TaskAutoRecord{
		SessionName:    sessionName,
		TaskDir:        taskDirKill,
		Status:         "running",
		MaxIterations:  10,
		TimeoutMinutes: 10,
	})

	killReq := httptest.NewRequest(http.MethodDelete, "/api/sessions/"+sessionId, nil)
	killReq.SetPathValue("sessionId", sessionId)
	killReq.Header.Set("Authorization", "Bearer test-secret")
	killW := httptest.NewRecorder()

	sessH.KillSession(killW, killReq)

	if killW.Code != http.StatusOK {
		t.Fatalf("Expected 200 from KillSession, got %d: %s", killW.Code, killW.Body.String())
	}

	// Verify draft deleted
	dContent, _ := database.GetDraft(sessionName)
	if dContent != "" {
		t.Errorf("Expected draft to be deleted, got: %q", dContent)
	}

	// Verify annotation deleted
	annRes, _ := database.GetAnnotation(sessionName, filepath.Join(tempDir, "sample.md"))
	if annRes != nil {
		t.Errorf("Expected annotation to be deleted, got: %+v", annRes)
	}

	// Verify task auto deleted
	autoRec, _ := database.GetTaskAuto(sessionName)
	if autoRec != nil {
		t.Errorf("Expected task auto record to be deleted, got: %+v", autoRec)
	}

	// Verify .auto-stop created with session_killed
	stopBytes, err := os.ReadFile(filepath.Join(taskDirKill, ".auto-stop"))
	if err != nil {
		t.Fatalf("Expected .auto-stop file created on kill: %v", err)
	}
	var stopPayload AutoStopPayload
	_ = json.Unmarshal(stopBytes, &stopPayload)
	if stopPayload.Reason != "session_killed" {
		t.Errorf("Expected reason session_killed, got: %s", stopPayload.Reason)
	}
}
