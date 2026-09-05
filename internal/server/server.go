package server

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/idle"
	"github.com/huacheng/ai-cli-online/internal/routes"
	"github.com/huacheng/ai-cli-online/internal/ws"
)

type Server struct {
	cfg      *config.Config
	db       *db.DB
	staticFS fs.FS
	httpSrv  *http.Server
}

func NewServer(cfg *config.Config, database *db.DB, staticFS fs.FS) *Server {
	return &Server{
		cfg:      cfg,
		db:       database,
		staticFS: staticFS,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	auth := routes.NewAuthHelper(s.cfg)
	sessH := routes.NewSessionHandler(auth, s.db)
	fileH := routes.NewFileHandler(auth)
	editH := routes.NewEditorHandler(auth, s.db)
	gitH := routes.NewGitHandler(auth)
	setH := routes.NewSettingsHandler(auth, s.db)
	chatH := routes.NewChatHandler(auth)
	wsH := routes.NewWorkspaceHandler(auth, s.db)
	hub := ws.InitHub(s.cfg)

	// Auto-seed default Home and project workspaces
	s.seedDefaultWorkspaces()

	// Chat & Headless AI Execution
	mux.HandleFunc("POST /api/sessions/{sessionId}/chat", chatH.HandleChat)
	mux.HandleFunc("POST /api/sessions/{sessionId}/chat/stream", chatH.HandleChatStream)
	mux.HandleFunc("POST /api/sessions/{sessionId}/chat/stop", chatH.HandleStop)

	// System & Health
	mux.HandleFunc("GET /api/health", routes.HandleHealth)
	mux.HandleFunc("GET /api/system/status", routes.HandleSystemStatus)

	// Auth
	mux.HandleFunc("POST /api/auth/login", auth.HandleLogin)
	mux.HandleFunc("GET /api/auth/verify", auth.HandleVerify)

	// Sessions
	mux.HandleFunc("GET /api/sessions", sessH.ListSessions)
	mux.HandleFunc("DELETE /api/sessions/{sessionId}", sessH.KillSession)
	mux.HandleFunc("GET /api/sessions/{sessionId}/cwd", sessH.GetCwd)
	mux.HandleFunc("GET /api/sessions/{sessionId}/pane-command", sessH.GetPaneCommand)

	// Files
	mux.HandleFunc("GET /api/sessions/{sessionId}/files", fileH.ListFiles)
	mux.HandleFunc("POST /api/sessions/{sessionId}/upload", fileH.Upload)
	mux.HandleFunc("GET /api/sessions/{sessionId}/download", fileH.Download)
	mux.HandleFunc("GET /api/sessions/{sessionId}/download-cwd", fileH.DownloadCwd)
	mux.HandleFunc("POST /api/sessions/{sessionId}/touch", fileH.Touch)
	mux.HandleFunc("POST /api/sessions/{sessionId}/mkdir", fileH.Mkdir)
	mux.HandleFunc("DELETE /api/sessions/{sessionId}/rm", fileH.Rm)
	mux.HandleFunc("GET /api/sessions/{sessionId}/file-content", fileH.GetFileContent)

	// Editor & Annotations
	mux.HandleFunc("GET /api/sessions/{sessionId}/draft", editH.GetDraft)
	mux.HandleFunc("PUT /api/sessions/{sessionId}/draft", editH.SaveDraft)
	mux.HandleFunc("GET /api/sessions/{sessionId}/annotations", editH.GetAnnotation)
	mux.HandleFunc("PUT /api/sessions/{sessionId}/annotations", editH.SaveAnnotation)
	mux.HandleFunc("POST /api/sessions/{sessionId}/task-annotations", editH.SaveTaskAnnotations)
	mux.HandleFunc("PUT /api/sessions/{sessionId}/file-content", editH.WriteFileContent)

	// Git
	mux.HandleFunc("GET /api/sessions/{sessionId}/git-log", gitH.GitLog)
	mux.HandleFunc("GET /api/sessions/{sessionId}/git-diff", gitH.GitDiff)
	mux.HandleFunc("GET /api/sessions/{sessionId}/git-branches", gitH.GitBranches)

	// Settings
	mux.HandleFunc("GET /api/settings/{key}", setH.GetSetting)
	mux.HandleFunc("PUT /api/settings/{key}", setH.SaveSetting)

	// Workspaces
	mux.HandleFunc("GET /api/workspaces", wsH.ListWorkspaces)
	mux.HandleFunc("POST /api/workspaces", wsH.CreateWorkspace)
	mux.HandleFunc("DELETE /api/workspaces/{id}", wsH.DeleteWorkspace)
	mux.HandleFunc("POST /api/sessions/{sessionId}/switch-workspace", wsH.SwitchSessionWorkspace)
	mux.HandleFunc("GET /api/sessions/{sessionId}/workspace-mode", wsH.GetSessionWorkspaceMode)

	// WebSocket
	mux.HandleFunc("/ws", hub.HandleWebSocket)

	// Static Assets with SPA Fallback
	var fileServer http.Handler
	if s.staticFS != nil {
		fileServer = http.FileServer(http.FS(s.staticFS))
	}

	spaHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
			http.NotFound(w, r)
			return
		}

		if s.staticFS == nil {
			http.Error(w, "Web UI assets not found", http.StatusNotFound)
			return
		}

		cleanPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if cleanPath == "." || cleanPath == "" {
			cleanPath = "index.html"
		}

		f, err := s.staticFS.Open(cleanPath)
		if err == nil {
			f.Close()
			if strings.HasPrefix(cleanPath, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else if cleanPath == "index.html" {
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				w.Header().Set("Pragma", "no-cache")
				w.Header().Set("Expires", "0")
			}
			if strings.HasSuffix(cleanPath, ".js") {
				w.Header().Set("Content-Type", "application/javascript")
			} else if strings.HasSuffix(cleanPath, ".css") {
				w.Header().Set("Content-Type", "text/css; charset=utf-8")
			} else if strings.HasSuffix(cleanPath, ".svg") {
				w.Header().Set("Content-Type", "image/svg+xml")
			} else if strings.HasSuffix(cleanPath, ".woff2") {
				w.Header().Set("Content-Type", "font/woff2")
			} else if strings.HasSuffix(cleanPath, ".woff") {
				w.Header().Set("Content-Type", "font/woff")
			} else if strings.HasSuffix(cleanPath, ".ttf") {
				w.Header().Set("Content-Type", "font/ttf")
			} else if strings.HasSuffix(cleanPath, ".webmanifest") {
				w.Header().Set("Content-Type", "application/manifest+json")
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		// Fallback to index.html for client-side routing
		indexFile, err := s.staticFS.Open("index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer indexFile.Close()

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.ServeContent(w, r, "index.html", time.Now(), indexFile.(ioReadSeeker))
	})

	// Wrap root with activity tracker
	rootHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		idle.GetManager().RecordActivity()
		spaHandler.ServeHTTP(w, r)
	})

	mux.Handle("/", rootHandler)

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	s.httpSrv = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	log.Printf("AGY Online server running at http://%s:%d", s.cfg.Host, s.cfg.Port)
	return s.httpSrv.ListenAndServe()
}

type ioReadSeeker interface {
	fs.File
	Seek(offset int64, whence int) (int64, error)
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpSrv != nil {
		return s.httpSrv.Shutdown(ctx)
	}
	return nil
}

func (s *Server) seedDefaultWorkspaces() {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		home = filepath.Clean(home)
		_, _ = s.db.AddWorkspace("home", "Home (~)", home, true)
	}

	defaultCwd := s.cfg.DefaultWorkingDir
	if defaultCwd != "" {
		cleanDefault := filepath.Clean(defaultCwd)
		if !strings.EqualFold(cleanDefault, home) {
			name := filepath.Base(cleanDefault)
			if name == "." || name == "/" || name == "\\" || name == "" {
				name = "Default Project"
			}
			id := "ws-default"
			_, _ = s.db.AddWorkspace(id, name, cleanDefault, false)
		}
	}
}
