package routes

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/tmux"
)

type AuthHelper struct {
	cfg *config.Config
}

func NewAuthHelper(cfg *config.Config) *AuthHelper {
	return &AuthHelper{cfg: cfg}
}

func (a *AuthHelper) ExtractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	if t := r.URL.Query().Get("token"); t != "" {
		return t
	}
	if cookie, err := r.Cookie("ai-cli-online-token"); err == nil {
		return cookie.Value
	}
	return ""
}

func (a *AuthHelper) CheckAuth(r *http.Request) bool {
	if a.cfg.AuthToken == "" {
		return true
	}
	token := a.ExtractToken(r)
	if token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(a.cfg.AuthToken)) == 1
}

func (a *AuthHelper) ResolveSession(w http.ResponseWriter, r *http.Request, sessionId string) string {
	if !a.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return ""
	}
	if !tmux.IsValidSessionId(sessionId) {
		http.Error(w, `{"error":"Invalid sessionId"}`, http.StatusBadRequest)
		return ""
	}
	token := a.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	return tmux.BuildSessionName(token, sessionId)
}

func (a *AuthHelper) TokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func (a *AuthHelper) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if a.cfg.AuthToken == "" || subtle.ConstantTimeCompare([]byte(req.Token), []byte(a.cfg.AuthToken)) == 1 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	}

	http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
}

func (a *AuthHelper) HandleVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	authRequired := (a.cfg.AuthToken != "")
	if a.CheckAuth(r) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"authenticated": true,
			"authRequired":  authRequired,
		})
	} else {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"authenticated": false,
			"authRequired":  authRequired,
		})
	}
}
