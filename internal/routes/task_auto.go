package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/huacheng/agy-online/internal/db"
	"github.com/huacheng/agy-online/internal/files"
	"github.com/huacheng/agy-online/internal/terminal"
)

type TaskAutoHandler struct {
	auth     *AuthHelper
	db       *db.DB
	mu       sync.Mutex
	watchers map[string]context.CancelFunc
}

func NewTaskAutoHandler(auth *AuthHelper, database *db.DB) *TaskAutoHandler {
	return &TaskAutoHandler{
		auth:     auth,
		db:       database,
		watchers: make(map[string]context.CancelFunc),
	}
}

type AutoSignalPayload struct {
	Step       string `json:"step"`
	Result     string `json:"result"`
	Next       string `json:"next"`
	Checkpoint string `json:"checkpoint,omitempty"`
	Iteration  int    `json:"iteration"`
	Timestamp  string `json:"timestamp"`
}

type AutoStopPayload struct {
	Reason    string `json:"reason"`
	Timestamp string `json:"timestamp"`
}

func (h *TaskAutoHandler) registerWatcher(sessionName string, cancel context.CancelFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if old, exists := h.watchers[sessionName]; exists {
		old()
	}
	h.watchers[sessionName] = cancel
}

func (h *TaskAutoHandler) unregisterWatcher(sessionName string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.watchers, sessionName)
}

func (h *TaskAutoHandler) cancelWatcher(sessionName string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if cancel, exists := h.watchers[sessionName]; exists {
		cancel()
		delete(h.watchers, sessionName)
	}
}

// POST /api/sessions/{sessionId}/task-auto
func (h *TaskAutoHandler) StartTaskAuto(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		TaskDir        string `json:"taskDir"`
		MaxIterations  int    `json:"maxIterations"`
		TimeoutMinutes int    `json:"timeoutMinutes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TaskDir == "" {
		http.Error(w, `{"error":"Valid taskDir required"}`, http.StatusBadRequest)
		return
	}

	cleanDir := filepath.Clean(req.TaskDir)
	fi, err := os.Stat(cleanDir)
	if err != nil || !fi.IsDir() {
		http.Error(w, `{"error":"Task directory does not exist or is not a directory"}`, http.StatusBadRequest)
		return
	}

	if h.db != nil {
		// Check if this session is already running an auto task
		existing, err := h.db.GetTaskAuto(sessionName)
		if err == nil && existing != nil && existing.Status == "running" {
			http.Error(w, `{"error":"An auto task is already running in this session"}`, http.StatusConflict)
			return
		}

		// Check if this task directory is already being worked on in another session
		existingDir, err := h.db.GetTaskAutoByDir(cleanDir)
		if err == nil && existingDir != nil && existingDir.Status == "running" && existingDir.SessionName != sessionName {
			http.Error(w, `{"error":"This task directory is already running in another session"}`, http.StatusConflict)
			return
		}
	}

	if req.MaxIterations <= 0 {
		req.MaxIterations = 20
	}
	if req.TimeoutMinutes <= 0 {
		req.TimeoutMinutes = 30
	}

	// Remove stale signal and stop files before startup
	_ = os.Remove(filepath.Join(cleanDir, ".auto-signal"))
	_ = os.Remove(filepath.Join(cleanDir, ".auto-stop"))

	startedAt := time.Now().UTC().Format(time.RFC3339)
	if h.db != nil {
		rec := &db.TaskAutoRecord{
			SessionName:    sessionName,
			TaskDir:        cleanDir,
			Status:         "running",
			MaxIterations:  req.MaxIterations,
			TimeoutMinutes: req.TimeoutMinutes,
			IterationCount: 0,
			StartedAt:      startedAt,
		}
		if err := h.db.UpsertTaskAuto(rec); err != nil {
			http.Error(w, `{"error":"Failed to record auto task state"}`, http.StatusInternalServerError)
			return
		}
	}

	// Dispatch agy "/auto <taskDir>" to session
	_ = terminal.SendKeys(sessionName, fmt.Sprintf("agy \"/auto %s\"", cleanDir), "Enter")

	// Start background watcher
	ctx, cancel := context.WithCancel(context.Background())
	h.registerWatcher(sessionName, cancel)
	go h.watchAutoLoop(ctx, sessionName, cleanDir, req.MaxIterations, req.TimeoutMinutes, time.Now())

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"sessionName":    sessionName,
		"taskDir":        cleanDir,
		"maxIterations":  req.MaxIterations,
		"timeoutMinutes": req.TimeoutMinutes,
		"startedAt":      startedAt,
	})
}

// DELETE /api/sessions/{sessionId}/task-auto
func (h *TaskAutoHandler) StopTaskAuto(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	h.cancelWatcher(sessionName)

	if h.db != nil {
		rec, err := h.db.GetTaskAuto(sessionName)
		if err == nil && rec != nil {
			stopPath := filepath.Join(rec.TaskDir, ".auto-stop")
			stopData, _ := json.Marshal(AutoStopPayload{
				Reason:    "user_stop",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			_ = files.AtomicWriteFile(stopPath, stopData, 0644)
			_ = h.db.DeleteTaskAuto(sessionName)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "stopped": true})
}

// CleanupSession cleans up auto task state, cancels watcher, and writes .auto-stop when a session is killed
func (h *TaskAutoHandler) CleanupSession(sessionName string) {
	h.cancelWatcher(sessionName)

	if h.db != nil {
		rec, err := h.db.GetTaskAuto(sessionName)
		if err == nil && rec != nil {
			stopPath := filepath.Join(rec.TaskDir, ".auto-stop")
			stopData, _ := json.Marshal(AutoStopPayload{
				Reason:    "session_killed",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			_ = files.AtomicWriteFile(stopPath, stopData, 0644)
			_ = os.Remove(filepath.Join(rec.TaskDir, ".auto-signal"))
			_ = h.db.DeleteTaskAuto(sessionName)
		}
	}
}

// RecoverOnStartup cleans up dead session zombie tasks or resumes live session watchers
func (h *TaskAutoHandler) RecoverOnStartup() {
	if h.db == nil {
		return
	}

	runningTasks, err := h.db.ListRunningTaskAuto()
	if err != nil {
		return
	}

	for _, rec := range runningTasks {
		if !terminal.Exists(rec.SessionName) {
			stopPath := filepath.Join(rec.TaskDir, ".auto-stop")
			stopData, _ := json.Marshal(AutoStopPayload{
				Reason:    "server_restart_session_dead",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			_ = files.AtomicWriteFile(stopPath, stopData, 0644)
			_ = os.Remove(filepath.Join(rec.TaskDir, ".auto-signal"))
			_ = h.db.DeleteTaskAuto(rec.SessionName)
			continue
		}

		startedTime, err := time.Parse(time.RFC3339, rec.StartedAt)
		if err != nil {
			startedTime = time.Now()
		}

		if time.Since(startedTime) >= time.Duration(rec.TimeoutMinutes)*time.Minute {
			stopPath := filepath.Join(rec.TaskDir, ".auto-stop")
			stopData, _ := json.Marshal(AutoStopPayload{
				Reason:    "timeout",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			_ = files.AtomicWriteFile(stopPath, stopData, 0644)
			_ = os.Remove(filepath.Join(rec.TaskDir, ".auto-signal"))
			_ = h.db.DeleteTaskAuto(rec.SessionName)
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		h.registerWatcher(rec.SessionName, cancel)
		go h.watchAutoLoop(ctx, rec.SessionName, rec.TaskDir, rec.MaxIterations, rec.TimeoutMinutes, startedTime)
	}
}

// GET /api/sessions/{sessionId}/task-auto
func (h *TaskAutoHandler) GetTaskAutoStatus(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	if h.db == nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"running": false})
		return
	}

	rec, err := h.db.GetTaskAuto(sessionName)
	if err != nil || rec == nil || rec.Status != "running" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"running": false})
		return
	}

	var sig *AutoSignalPayload
	signalPath := filepath.Join(rec.TaskDir, ".auto-signal")
	if data, err := os.ReadFile(signalPath); err == nil && len(data) > 0 {
		var s AutoSignalPayload
		if err := json.Unmarshal(data, &s); err == nil {
			sig = &s
		}
	}

	elapsed := 0
	if parsedTime, err := time.Parse(time.RFC3339, rec.StartedAt); err == nil {
		elapsed = int(time.Since(parsedTime).Seconds())
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"running":        true,
		"sessionName":    rec.SessionName,
		"taskDir":        rec.TaskDir,
		"maxIterations":  rec.MaxIterations,
		"timeoutMinutes": rec.TimeoutMinutes,
		"iterationCount": rec.IterationCount,
		"elapsedSeconds": elapsed,
		"lastSignalAt":   rec.LastSignalAt,
		"signal":         sig,
	})
}

// GET /api/task-auto/lookup?taskDir=<path>
func (h *TaskAutoHandler) LookupTaskAuto(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	taskDir := r.URL.Query().Get("taskDir")
	if taskDir == "" {
		http.Error(w, `{"error":"taskDir query parameter required"}`, http.StatusBadRequest)
		return
	}

	if h.db == nil {
		http.Error(w, `{"error":"Database not available"}`, http.StatusInternalServerError)
		return
	}

	cleanDir := filepath.Clean(taskDir)
	rec, err := h.db.GetTaskAutoByDir(cleanDir)
	if err != nil || rec == nil {
		http.Error(w, `{"error":"Task auto session not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"sessionName": rec.SessionName,
		"status":      rec.Status,
		"taskDir":     rec.TaskDir,
	})
}

func (h *TaskAutoHandler) watchAutoLoop(ctx context.Context, sessionName, taskDir string, maxIterations, timeoutMinutes int, startTime time.Time) {
	defer h.unregisterWatcher(sessionName)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	signalPath := filepath.Join(taskDir, ".auto-signal")
	stopPath := filepath.Join(taskDir, ".auto-stop")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// 1. Check if session was terminated or killed externally
			if !terminal.Exists(sessionName) {
				stopData, _ := json.Marshal(AutoStopPayload{
					Reason:    "session_terminated",
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
				_ = files.AtomicWriteFile(stopPath, stopData, 0644)
				_ = os.Remove(signalPath)
				if h.db != nil {
					_ = h.db.DeleteTaskAuto(sessionName)
				}
				return
			}

			// 2. Check if task directory was deleted
			if _, err := os.Stat(taskDir); os.IsNotExist(err) {
				if h.db != nil {
					_ = h.db.DeleteTaskAuto(sessionName)
				}
				return
			}

			// 3. Check timeout
			if time.Since(startTime) >= time.Duration(timeoutMinutes)*time.Minute {
				stopData, _ := json.Marshal(AutoStopPayload{
					Reason:    "timeout",
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
				_ = files.AtomicWriteFile(stopPath, stopData, 0644)
				if h.db != nil {
					_ = h.db.DeleteTaskAuto(sessionName)
				}
				return
			}

			// 4. Read .auto-signal if present
			if data, err := os.ReadFile(signalPath); err == nil && len(data) > 0 {
				var sig AutoSignalPayload
				if err := json.Unmarshal(data, &sig); err == nil {
					if h.db != nil {
						_ = h.db.UpdateTaskAutoSignal(sessionName, sig.Iteration, sig.Timestamp)
					}

					// Natural completion check
					if sig.Next == "(stop)" {
						_ = os.Remove(signalPath)
						_ = os.Remove(stopPath)
						if h.db != nil {
							_ = h.db.DeleteTaskAuto(sessionName)
						}
						return
					}

					// Max iterations check
					if sig.Iteration >= maxIterations {
						stopData, _ := json.Marshal(AutoStopPayload{
							Reason:    "max_iterations",
							Timestamp: time.Now().UTC().Format(time.RFC3339),
						})
						_ = files.AtomicWriteFile(stopPath, stopData, 0644)
						if h.db != nil {
							_ = h.db.DeleteTaskAuto(sessionName)
						}
						return
					}
				}
			}
		}
	}
}
