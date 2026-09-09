package routes

import (
	"encoding/json"
	"net/http"

	"github.com/huacheng/agy-online/internal/tunnel"
)

type TunnelHandler struct {
	auth       *AuthHelper
	mgr        *tunnel.Manager
	serverPort int
}

func NewTunnelHandler(auth *AuthHelper, mgr *tunnel.Manager, serverPort int) *TunnelHandler {
	return &TunnelHandler{
		auth:       auth,
		mgr:        mgr,
		serverPort: serverPort,
	}
}

type StartTunnelRequest struct {
	Mode  string `json:"mode"`  // "quick" or "token"
	Token string `json:"token"` // Cloudflare Zero Trust token
	Port  int    `json:"port"`  // Port to tunnel
}

// GetStatus handles GET /api/tunnel/status
func (h *TunnelHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	st := h.mgr.Status()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}

// Start handles POST /api/tunnel/start
func (h *TunnelHandler) Start(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req StartTunnelRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	port := req.Port
	if port <= 0 {
		port = h.serverPort
	}
	if port <= 0 {
		port = 3001
	}

	mode := req.Mode
	if mode == "" {
		mode = "quick"
	}

	st, err := h.mgr.Start(r.Context(), mode, req.Token, port)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": h.mgr.Status(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}

// Stop handles POST /api/tunnel/stop
func (h *TunnelHandler) Stop(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if err := h.mgr.Stop(); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	st := h.mgr.Status()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}

// Install handles POST /api/tunnel/install
func (h *TunnelHandler) Install(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if err := h.mgr.Install(r.Context()); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": h.mgr.Status(),
		})
		return
	}

	st := h.mgr.Status()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}
