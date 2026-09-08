package routes

import (
	"encoding/json"
	"net/http"

	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/terminal"
	"github.com/huacheng/ai-cli-online/internal/ws"
)

type SessionHandler struct {
	auth     *AuthHelper
	db       *db.DB
	taskAuto *TaskAutoHandler
}

func NewSessionHandler(auth *AuthHelper, database *db.DB, taskAuto *TaskAutoHandler) *SessionHandler {
	return &SessionHandler{
		auth:     auth,
		db:       database,
		taskAuto: taskAuto,
	}
}

func (s *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	if !s.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}
	token := s.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}

	activeNames := ws.GetHub().ActiveSessionNames()
	sessions, err := terminal.List(token, activeNames, s.auth.cfg.DefaultWorkingDir)
	if err != nil {
		http.Error(w, `{"error":"Failed to list sessions"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sessions)
}

func (s *SessionHandler) KillSession(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := s.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	// 1. Terminate any running auto task and write .auto-stop
	if s.taskAuto != nil {
		s.taskAuto.CleanupSession(sessionName)
	}

	// 2. Disconnect active websocket connection if open
	if hub := ws.GetHub(); hub != nil {
		hub.CloseSession(sessionName)
	}

	// 3. Clean up database state (drafts, annotations)
	if s.db != nil {
		_ = s.db.DeleteDraft(sessionName)
		_ = s.db.DeleteAnnotationsForSession(sessionName)
	}

	// 4. Kill tmux or direct PTY terminal session
	_ = terminal.Kill(sessionName)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *SessionHandler) GetCwd(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := s.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, s.auth.cfg.DefaultWorkingDir)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"cwd": cwd})
}

func (s *SessionHandler) GetPaneCommand(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := s.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cmd := terminal.GetPaneCommand(sessionName)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"command": cmd})
}
