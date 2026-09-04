package routes

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/huacheng/ai-cli-online/internal/db"
)

type EditorHandler struct {
	auth *AuthHelper
	db   *db.DB
}

func NewEditorHandler(auth *AuthHelper, database *db.DB) *EditorHandler {
	return &EditorHandler{
		auth: auth,
		db:   database,
	}
}

func (e *EditorHandler) GetDraft(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	content, err := e.db.GetDraft(sessionName)
	if err != nil {
		http.Error(w, `{"error":"Failed to get draft"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"content": content})
}

func (e *EditorHandler) SaveDraft(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
		return
	}

	if err := e.db.SaveDraft(sessionName, req.Content); err != nil {
		http.Error(w, `{"error":"Failed to save draft"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (e *EditorHandler) GetAnnotation(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, `{"error":"path query parameter required"}`, http.StatusBadRequest)
		return
	}

	res, err := e.db.GetAnnotation(sessionName, filePath)
	if err != nil {
		http.Error(w, `{"error":"Failed to get annotation"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if res == nil {
		_ = json.NewEncoder(w).Encode(map[string]any{"content": nil, "updatedAt": 0})
	} else {
		_ = json.NewEncoder(w).Encode(res)
	}
}

func (e *EditorHandler) SaveAnnotation(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Path      string `json:"path"`
		Content   string `json:"content"`
		UpdatedAt int64  `json:"updatedAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
		return
	}

	if err := e.db.SaveAnnotation(sessionName, req.Path, req.Content, req.UpdatedAt); err != nil {
		http.Error(w, `{"error":"Failed to save annotation"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (e *EditorHandler) SaveTaskAnnotations(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		ModulePath string         `json:"modulePath"`
		Content    map[string]any `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ModulePath == "" || req.Content == nil {
		http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
		return
	}

	if !filepath.IsAbs(req.ModulePath) || !strings.Contains(req.ModulePath, "/AiTasks/") {
		http.Error(w, `{"error":"modulePath must be an absolute path under AiTasks/"}`, http.StatusBadRequest)
		return
	}

	targetFile := filepath.Join(filepath.Clean(req.ModulePath), ".tmp-annotations.json")
	if filepath.Base(targetFile) != ".tmp-annotations.json" || !strings.Contains(targetFile, "/AiTasks/") {
		http.Error(w, `{"error":"Invalid target path"}`, http.StatusBadRequest)
		return
	}

	if fi, err := os.Stat(req.ModulePath); err != nil || !fi.IsDir() {
		http.Error(w, `{"error":"Directory not found"}`, http.StatusBadRequest)
		return
	}

	data, err := json.MarshalIndent(req.Content, "", "  ")
	if err != nil {
		http.Error(w, `{"error":"Failed to marshal content"}`, http.StatusBadRequest)
		return
	}

	if err := os.WriteFile(targetFile, data, 0644); err != nil {
		http.Error(w, `{"error":"Failed to write annotation file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "path": targetFile})
}

func (e *EditorHandler) WriteFileContent(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := e.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) > 10*1024*1024 {
		http.Error(w, `{"error":"Content too large (max 10MB)"}`, http.StatusRequestEntityTooLarge)
		return
	}

	if !filepath.IsAbs(req.Path) || !strings.Contains(req.Path, "/AiTasks/") {
		http.Error(w, `{"error":"path must be absolute and under AiTasks/"}`, http.StatusBadRequest)
		return
	}

	resolved := filepath.Clean(req.Path)
	fi, err := os.Stat(resolved)
	if err != nil || fi.IsDir() {
		http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
		return
	}

	if err := os.WriteFile(resolved, []byte(req.Content), 0644); err != nil {
		http.Error(w, `{"error":"Failed to write file"}`, http.StatusInternalServerError)
		return
	}

	newFi, _ := os.Stat(resolved)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":    true,
		"mtime": float64(newFi.ModTime().UnixMilli()),
	})
}
