package routes

import (
	"encoding/json"
	"net/http"

	"github.com/huacheng/agy-online/internal/db"
)

type SettingsHandler struct {
	auth *AuthHelper
	db   *db.DB
}

func NewSettingsHandler(auth *AuthHelper, database *db.DB) *SettingsHandler {
	return &SettingsHandler{
		auth: auth,
		db:   database,
	}
}

func (s *SettingsHandler) GetSetting(w http.ResponseWriter, r *http.Request) {
	if !s.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	key := r.PathValue("key")
	if key == "" {
		http.Error(w, `{"error":"Key required"}`, http.StatusBadRequest)
		return
	}

	token := s.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	tokenHash := s.auth.TokenHash(token)

	val, found, err := s.db.GetSetting(tokenHash, key)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if !found {
		_ = json.NewEncoder(w).Encode(map[string]any{"value": nil})
	} else {
		_ = json.NewEncoder(w).Encode(map[string]any{"value": val})
	}
}

func (s *SettingsHandler) SaveSetting(w http.ResponseWriter, r *http.Request) {
	if !s.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	key := r.PathValue("key")
	if key == "" {
		http.Error(w, `{"error":"Key required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
		return
	}

	token := s.auth.ExtractToken(r)
	if token == "" {
		token = "default"
	}
	tokenHash := s.auth.TokenHash(token)

	if err := s.db.SaveSetting(tokenHash, key, req.Value); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}
