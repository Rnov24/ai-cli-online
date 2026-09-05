package routes

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/huacheng/ai-cli-online/internal/agy"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/tmux"
)

type WorkspaceHandler struct {
	auth *AuthHelper
	db   *db.DB
}

func NewWorkspaceHandler(auth *AuthHelper, database *db.DB) *WorkspaceHandler {
	return &WorkspaceHandler{auth: auth, db: database}
}

type WorkspacesResponse struct {
	Home              string         `json:"home"`
	ActiveWorkspaceId string         `json:"activeWorkspaceId"`
	ActivePath        string         `json:"activePath"`
	IsHome            bool           `json:"isHome"`
	Mode              string         `json:"mode"`
	Workspaces        []db.Workspace `json:"workspaces"`
}

type WorkspaceModeResponse struct {
	Cwd           string `json:"cwd"`
	IsHome        bool   `json:"isHome"`
	Mode          string `json:"mode"`
	WorkspaceName string `json:"workspaceName"`
}

func (h *WorkspaceHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	token := h.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	tokenHash := h.auth.TokenHash(token)

	home, _ := os.UserHomeDir()
	if home != "" {
		home = filepath.Clean(home)
	}

	workspaces, err := h.db.ListWorkspaces()
	if err != nil {
		http.Error(w, `{"error":"Failed to query workspaces"}`, http.StatusInternalServerError)
		return
	}

	// Active workspace from settings
	activeWsId, _, _ := h.db.GetSetting(tokenHash, "active_workspace")
	activePath := home
	activeMode := string(agy.ModeAgenticAssistant)
	isHome := true

	if activeWsId != "" {
		for _, ws := range workspaces {
			if ws.Id == activeWsId {
				activePath = ws.Path
				isHome = ws.IsHome || agy.IsHomeDirectory(ws.Path)
				activeMode = string(agy.ResolveAgentMode(ws.Path))
				break
			}
		}
	} else if len(workspaces) > 0 {
		// Default to first non-home if available, otherwise home
		for _, ws := range workspaces {
			if !ws.IsHome {
				activeWsId = ws.Id
				activePath = ws.Path
				isHome = false
				activeMode = string(agy.ModeCodingAgent)
				break
			}
		}
		if activeWsId == "" {
			activeWsId = workspaces[0].Id
			activePath = workspaces[0].Path
			isHome = workspaces[0].IsHome
			activeMode = string(agy.ResolveAgentMode(activePath))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(WorkspacesResponse{
		Home:              home,
		ActiveWorkspaceId: activeWsId,
		ActivePath:        activePath,
		IsHome:            isHome,
		Mode:              activeMode,
		Workspaces:        workspaces,
	})
}

func (h *WorkspaceHandler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Path) == "" {
		http.Error(w, `{"error":"Directory path required"}`, http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(strings.TrimSpace(req.Path))
	fi, err := os.Stat(cleanPath)
	if err != nil || !fi.IsDir() {
		http.Error(w, `{"error":"Path does not exist or is not a directory"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = filepath.Base(cleanPath)
		if name == "." || name == "/" || name == "\\" {
			name = "Project"
		}
	}

	isHome := agy.IsHomeDirectory(cleanPath)
	id := "ws-" + strconv.FormatInt(time.Now().UnixNano(), 36)

	ws, err := h.db.AddWorkspace(id, name, cleanPath, isHome)
	if err != nil {
		http.Error(w, `{"error":"Failed to save workspace"}`, http.StatusInternalServerError)
		return
	}

	token := h.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	tokenHash := h.auth.TokenHash(token)
	_ = h.db.SaveSetting(tokenHash, "active_workspace", ws.Id)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(ws)
}

func (h *WorkspaceHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "home" {
		http.Error(w, `{"error":"Cannot delete Home workspace"}`, http.StatusBadRequest)
		return
	}

	if err := h.db.DeleteWorkspace(id); err != nil {
		http.Error(w, `{"error":"Failed to delete workspace"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (h *WorkspaceHandler) SwitchSessionWorkspace(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		WorkspaceId string `json:"workspaceId"`
		Path        string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	targetPath := strings.TrimSpace(req.Path)
	targetName := ""
	targetId := req.WorkspaceId

	if targetPath == "" && targetId != "" {
		ws, err := h.db.GetWorkspaceById(targetId)
		if err == nil && ws != nil {
			targetPath = ws.Path
			targetName = ws.Name
		}
	}

	if targetPath == "" {
		http.Error(w, `{"error":"Target path or workspace ID required"}`, http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(targetPath)
	if fi, err := os.Stat(cleanPath); err != nil || !fi.IsDir() {
		http.Error(w, `{"error":"Target directory does not exist"}`, http.StatusBadRequest)
		return
	}

	if targetName == "" {
		targetName = filepath.Base(cleanPath)
	}

	// Change directory in active tmux session if present
	if tmux.HasSession(sessionName) {
		// Escape backslashes for shell
		escapedPath := strings.ReplaceAll(cleanPath, `\`, `/`)
		cmdStr := fmt.Sprintf("cd %q", escapedPath)
		_ = tmux.SendKeys(sessionName, cmdStr, "Enter")
	}

	// Persist active workspace in user settings
	token := h.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	tokenHash := h.auth.TokenHash(token)
	if targetId != "" {
		_ = h.db.SaveSetting(tokenHash, "active_workspace", targetId)
	}

	isHome := agy.IsHomeDirectory(cleanPath)
	mode := agy.ResolveAgentMode(cleanPath)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":            true,
		"cwd":           cleanPath,
		"isHome":        isHome,
		"mode":          string(mode),
		"workspaceName": targetName,
	})
}

func (h *WorkspaceHandler) GetSessionWorkspaceMode(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := tmux.GetCwd(sessionName, h.auth.cfg.DefaultWorkingDir)
	isHome := agy.IsHomeDirectory(cwd)
	mode := agy.ResolveAgentMode(cwd)

	name := filepath.Base(cwd)
	if isHome {
		name = "Home (~)"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(WorkspaceModeResponse{
		Cwd:           cwd,
		IsHome:        isHome,
		Mode:          string(mode),
		WorkspaceName: name,
	})
}
