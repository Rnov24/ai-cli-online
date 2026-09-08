package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
)

func TestTaskAutoHandler(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-task-auto-routes-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := db.Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}
	defer database.Close()

	cfg := &config.Config{AuthToken: "test-secret-token"}
	auth := NewAuthHelper(cfg)
	handler := NewTaskAutoHandler(auth, database)

	validTaskDir := filepath.Join(tempDir, "AiTasks", "feature-test")
	_ = os.MkdirAll(validTaskDir, 0755)

	sessionId := "sess-auto-1"

	t.Run("Unauthorized request returns 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/task-auto", nil)
		w := httptest.NewRecorder()
		handler.GetTaskAutoStatus(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", w.Code)
		}
	})

	t.Run("Status returns running false initially", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/task-auto", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.GetTaskAutoStatus(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if resp["running"] != false {
			t.Errorf("Expected running=false, got %v", resp["running"])
		}
	})

	t.Run("StartTaskAuto fails on non-existent task directory", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"taskDir": filepath.Join(tempDir, "AiTasks", "non-existent"),
		})
		req := httptest.NewRequest("POST", "/api/sessions/"+sessionId+"/task-auto", bytes.NewReader(body))
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.StartTaskAuto(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("StartTaskAuto succeeds with valid directory", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"taskDir":        validTaskDir,
			"maxIterations":  15,
			"timeoutMinutes": 20,
		})
		req := httptest.NewRequest("POST", "/api/sessions/"+sessionId+"/task-auto", bytes.NewReader(body))
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.StartTaskAuto(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if resp["ok"] != true || resp["taskDir"] != validTaskDir {
			t.Errorf("Unexpected response: %+v", resp)
		}
	})

	t.Run("StartTaskAuto returns 409 Conflict if already running", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"taskDir": validTaskDir,
		})
		req := httptest.NewRequest("POST", "/api/sessions/"+sessionId+"/task-auto", bytes.NewReader(body))
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.StartTaskAuto(w, req)

		if w.Code != http.StatusConflict {
			t.Errorf("Expected 409 Conflict, got %d", w.Code)
		}
	})

	t.Run("LookupTaskAuto finds active task", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/task-auto/lookup?taskDir="+validTaskDir, nil)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.LookupTaskAuto(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if resp["status"] != "running" {
			t.Errorf("Expected status=running, got %v", resp["status"])
		}
	})

	t.Run("GetTaskAutoStatus returns active task details and reads .auto-signal", func(t *testing.T) {
		// Mock write .auto-signal into task directory
		sigData := AutoSignalPayload{
			Step:       "check",
			Result:     "PASS",
			Next:       "exec",
			Checkpoint: "post-plan",
			Iteration:  2,
			Timestamp:  "2026-09-08T18:00:00Z",
		}
		sigBytes, _ := json.Marshal(sigData)
		_ = os.WriteFile(filepath.Join(validTaskDir, ".auto-signal"), sigBytes, 0644)

		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/task-auto", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.GetTaskAutoStatus(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Running        bool               `json:"running"`
			TaskDir        string             `json:"taskDir"`
			MaxIterations  int                `json:"maxIterations"`
			TimeoutMinutes int                `json:"timeoutMinutes"`
			Signal         *AutoSignalPayload `json:"signal"`
		}
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if !resp.Running || resp.Signal == nil || resp.Signal.Step != "check" || resp.Signal.Result != "PASS" {
			t.Errorf("Unexpected status response: %+v", resp)
		}
	})

	t.Run("StopTaskAuto terminates auto loop and writes .auto-stop", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/sessions/"+sessionId+"/task-auto", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer test-secret-token")
		w := httptest.NewRecorder()
		handler.StopTaskAuto(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		// Verify .auto-stop was written
		stopPath := filepath.Join(validTaskDir, ".auto-stop")
		stopBytes, err := os.ReadFile(stopPath)
		if err != nil {
			t.Fatalf("Expected .auto-stop file to exist: %v", err)
		}
		var stopPayload AutoStopPayload
		if err := json.Unmarshal(stopBytes, &stopPayload); err != nil || stopPayload.Reason != "user_stop" {
			t.Errorf("Unexpected stop payload: %s", string(stopBytes))
		}

		// Verify status now reports running = false
		statusReq := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/task-auto", nil)
		statusReq.SetPathValue("sessionId", sessionId)
		statusReq.Header.Set("Authorization", "Bearer test-secret-token")
		statusW := httptest.NewRecorder()
		handler.GetTaskAutoStatus(statusW, statusReq)
		var statusResp map[string]any
		_ = json.NewDecoder(statusW.Body).Decode(&statusResp)
		if statusResp["running"] != false {
			t.Errorf("Expected running=false after stop, got %v", statusResp["running"])
		}
	})

	t.Run("CleanupSession stops watcher, writes .auto-stop with session_killed, and deletes DB record", func(t *testing.T) {
		sessionClean := "clean-sess-1"
		taskDirClean := filepath.Join(tempDir, "AiTasks", "task-clean")
		_ = os.MkdirAll(taskDirClean, 0755)

		_ = database.UpsertTaskAuto(&db.TaskAutoRecord{
			SessionName:    sessionClean,
			TaskDir:        taskDirClean,
			Status:         "running",
			MaxIterations:  10,
			TimeoutMinutes: 15,
		})

		handler.CleanupSession(sessionClean)

		// Verify record is deleted
		rec, _ := database.GetTaskAuto(sessionClean)
		if rec != nil {
			t.Errorf("Expected task auto record to be deleted, got %+v", rec)
		}

		// Verify .auto-stop reason is session_killed
		stopBytes, err := os.ReadFile(filepath.Join(taskDirClean, ".auto-stop"))
		if err != nil {
			t.Fatalf("Expected .auto-stop file: %v", err)
		}
		var stopPayload AutoStopPayload
		_ = json.Unmarshal(stopBytes, &stopPayload)
		if stopPayload.Reason != "session_killed" {
			t.Errorf("Expected reason session_killed, got %s", stopPayload.Reason)
		}
	})

	t.Run("RecoverOnStartup reaps dead sessions and removes orphaned task locks", func(t *testing.T) {
		sessionDead := "dead-nonexistent-session"
		taskDirDead := filepath.Join(tempDir, "AiTasks", "task-dead")
		_ = os.MkdirAll(taskDirDead, 0755)

		_ = database.UpsertTaskAuto(&db.TaskAutoRecord{
			SessionName:    sessionDead,
			TaskDir:        taskDirDead,
			Status:         "running",
			MaxIterations:  10,
			TimeoutMinutes: 15,
		})

		handler.RecoverOnStartup()

		// Dead session record should be reaped from DB
		rec, _ := database.GetTaskAuto(sessionDead)
		if rec != nil {
			t.Errorf("Expected dead session task to be reaped from DB, got %+v", rec)
		}

		// .auto-stop should have reason server_restart_session_dead
		stopBytes, err := os.ReadFile(filepath.Join(taskDirDead, ".auto-stop"))
		if err != nil {
			t.Fatalf("Expected .auto-stop file for reaped dead session: %v", err)
		}
		var stopPayload AutoStopPayload
		_ = json.Unmarshal(stopBytes, &stopPayload)
		if stopPayload.Reason != "server_restart_session_dead" {
			t.Errorf("Expected reason server_restart_session_dead, got %s", stopPayload.Reason)
		}
	})

	t.Run("watchAutoLoop reaps task and writes session_terminated when session terminates", func(t *testing.T) {
		sessionTerm := "session-terminated-test"
		taskDirTerm := filepath.Join(tempDir, "AiTasks", "task-term")
		_ = os.MkdirAll(taskDirTerm, 0755)

		_ = database.UpsertTaskAuto(&db.TaskAutoRecord{
			SessionName:    sessionTerm,
			TaskDir:        taskDirTerm,
			Status:         "running",
			MaxIterations:  10,
			TimeoutMinutes: 15,
		})

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		go handler.watchAutoLoop(ctx, sessionTerm, taskDirTerm, 10, 15, time.Now())

		// Wait for ticker (2s) to execute session check
		time.Sleep(2200 * time.Millisecond)

		// Dead session record should be reaped from DB
		rec, _ := database.GetTaskAuto(sessionTerm)
		if rec != nil {
			t.Errorf("Expected terminated session record to be deleted, got %+v", rec)
		}

		// .auto-stop should have reason session_terminated
		stopBytes, err := os.ReadFile(filepath.Join(taskDirTerm, ".auto-stop"))
		if err != nil {
			t.Fatalf("Expected .auto-stop file: %v", err)
		}
		var stopPayload AutoStopPayload
		_ = json.Unmarshal(stopBytes, &stopPayload)
		if stopPayload.Reason != "session_terminated" {
			t.Errorf("Expected reason session_terminated, got %s", stopPayload.Reason)
		}
	})
}
