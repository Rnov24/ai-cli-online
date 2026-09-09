package routes

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/huacheng/agy-online/internal/agy"
)

type AgyProfilesHandler struct {
	auth *AuthHelper
}

func NewAgyProfilesHandler(auth *AuthHelper) *AgyProfilesHandler {
	return &AgyProfilesHandler{auth: auth}
}

// ListProfiles returns all saved Google Antigravity account profiles and the active profile.
func (h *AgyProfilesHandler) ListProfiles(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	resp, err := agy.ListProfiles()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type profileNameRequest struct {
	Name string `json:"name"`
}

// SwitchProfile switches the active Antigravity OAuth token to the requested profile.
func (h *AgyProfilesHandler) SwitchProfile(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req profileNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"Profile name cannot be empty"}`, http.StatusBadRequest)
		return
	}

	if err := agy.SwitchProfile(name); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"current": name,
	})
}

// SaveProfile saves the currently authenticated Antigravity OAuth token as a new profile.
func (h *AgyProfilesHandler) SaveProfile(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req profileNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"Profile name cannot be empty"}`, http.StatusBadRequest)
		return
	}

	if err := agy.SaveCurrentProfile(name); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"current": name,
	})
}

type importProfileRequest struct {
	Name  string `json:"name"`
	Token string `json:"token"`
}

// ImportProfile creates a profile with the provided raw token JSON or access token and activates it.
func (h *AgyProfilesHandler) ImportProfile(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req importProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	token := strings.TrimSpace(req.Token)
	if name == "" || token == "" {
		http.Error(w, `{"error":"Profile name and token are required"}`, http.StatusBadRequest)
		return
	}

	if err := agy.ImportProfile(name, token); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"current": name,
	})
}

type renameProfileRequest struct {
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
}

// RenameProfile renames an existing profile.
func (h *AgyProfilesHandler) RenameProfile(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req renameProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if err := agy.RenameProfile(req.OldName, req.NewName); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
	})
}

// DeleteProfile removes an existing non-active profile.
func (h *AgyProfilesHandler) DeleteProfile(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	name := r.PathValue("name")
	if name == "" {
		http.Error(w, `{"error":"Profile name is required"}`, http.StatusBadRequest)
		return
	}

	if err := agy.DeleteProfile(name); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
	})
}

type startAuthRequest struct {
	ProfileName string `json:"profileName"`
}

// StartAuth triggers an interactive OAuth session and returns the Google Auth URL.
func (h *AgyProfilesHandler) StartAuth(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req startAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	profileName := strings.TrimSpace(req.ProfileName)
	if profileName == "" {
		http.Error(w, `{"error":"Profile name is required"}`, http.StatusBadRequest)
		return
	}

	resp, err := agy.StartAuthFlow(profileName)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type submitAuthCodeRequest struct {
	FlowID      string `json:"flowId"`
	ProfileName string `json:"profileName"`
	Code        string `json:"code"`
}

// SubmitAuthCode submits the user-entered authorization code and saves the generated token.
func (h *AgyProfilesHandler) SubmitAuthCode(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req submitAuthCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.FlowID == "" || req.Code == "" {
		http.Error(w, `{"error":"Flow ID and authorization code are required"}`, http.StatusBadRequest)
		return
	}

	if err := agy.SubmitAuthCode(req.FlowID, req.ProfileName, req.Code); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	pName := req.ProfileName
	if pName == "" {
		pName = agy.GetCurrentProfile()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"current": pName,
	})
}

type cancelAuthRequest struct {
	FlowID string `json:"flowId"`
}

// CancelAuth cancels an active OAuth flow.
func (h *AgyProfilesHandler) CancelAuth(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req cancelAuthRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.FlowID != "" {
		agy.CancelAuthFlow(req.FlowID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
	})
}
