package routes

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/huacheng/agy-online/internal/db"
	"github.com/huacheng/agy-online/internal/persona"
	"github.com/huacheng/agy-online/internal/terminal"
)

var validPersonaIdRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-]+$`)

type PersonasResponse struct {
	Personas        []persona.PersonaDefinition `json:"personas"`
	Count           int                         `json:"count"`
	ActivePersonaId string                      `json:"activePersonaId,omitempty"`
}

type CreatePersonaRequest struct {
	Id          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Icon        string   `json:"icon,omitempty"`
	Color       string   `json:"color,omitempty"`
	Description string   `json:"description,omitempty"`
	Directive   string   `json:"directive"`
	Tags        []string `json:"tags,omitempty"`
}

type SetSessionPersonaRequest struct {
	PersonaId string `json:"personaId"`
}

type PersonasHandler struct {
	auth *AuthHelper
	db   *db.DB
}

func NewPersonasHandler(auth *AuthHelper, database *db.DB) *PersonasHandler {
	return &PersonasHandler{auth: auth, db: database}
}

// ListPersonas handles GET /api/personas.
func (h *PersonasHandler) ListPersonas(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	presets := persona.GetAllPresetPersonas()
	allPersonas := make([]persona.PersonaDefinition, len(presets))
	copy(allPersonas, presets)

	// Fetch custom personas from SQLite if db is present
	if h.db != nil {
		if customList, err := h.db.ListCustomPersonas(); err == nil {
			for _, cp := range customList {
				var tags []string
				if cp.Tags != "" {
					_ = json.Unmarshal([]byte(cp.Tags), &tags)
				}

				allPersonas = append(allPersonas, persona.PersonaDefinition{
					Id:          cp.Id,
					Name:        cp.Name,
					Role:        cp.Role,
					Icon:        cp.Icon,
					Color:       cp.Color,
					Description: cp.Description,
					Directive:   cp.Directive,
					IsPreset:    false,
					Tags:        tags,
				})
			}
		}
	}

	sessionId := r.URL.Query().Get("sessionId")
	activePersonaId := ""
	if sessionId != "" && h.db != nil {
		token := h.auth.ExtractToken(r)
		if token == "" {
			token = "default"
		}
		tokenHash := h.auth.TokenHash(token)
		sessionName := terminal.BuildSessionName(token, sessionId)
		if val, found, _ := h.db.GetSetting(tokenHash, "session_persona:"+sessionName); found {
			activePersonaId = val
		}
	}

	resp := PersonasResponse{
		Personas:        allPersonas,
		Count:           len(allPersonas),
		ActivePersonaId: activePersonaId,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// GetPersona handles GET /api/personas/{id}.
func (h *PersonasHandler) GetPersona(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" || !validPersonaIdRegex.MatchString(id) {
		http.Error(w, `{"error":"Invalid persona ID"}`, http.StatusBadRequest)
		return
	}

	if p, found := persona.GetPresetPersona(id); found {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(p)
		return
	}

	if h.db != nil {
		if cp, err := h.db.GetCustomPersona(id); err == nil && cp != nil {
			var tags []string
			if cp.Tags != "" {
				_ = json.Unmarshal([]byte(cp.Tags), &tags)
			}
			p := persona.PersonaDefinition{
				Id:          cp.Id,
				Name:        cp.Name,
				Role:        cp.Role,
				Icon:        cp.Icon,
				Color:       cp.Color,
				Description: cp.Description,
				Directive:   cp.Directive,
				IsPreset:    false,
				Tags:        tags,
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(p)
			return
		}
	}

	http.Error(w, `{"error":"Persona not found"}`, http.StatusNotFound)
}

// CreateCustomPersona handles POST /api/personas.
func (h *PersonasHandler) CreateCustomPersona(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreatePersonaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid JSON payload"}`, http.StatusBadRequest)
		return
	}

	req.Id = strings.TrimSpace(req.Id)
	req.Name = strings.TrimSpace(req.Name)
	req.Role = strings.TrimSpace(req.Role)
	req.Directive = strings.TrimSpace(req.Directive)

	if req.Id == "" || !validPersonaIdRegex.MatchString(req.Id) || len(req.Id) > 64 {
		http.Error(w, `{"error":"Invalid persona ID. Must be 1-64 alphanumeric characters, underscores, or hyphens."}`, http.StatusBadRequest)
		return
	}

	if _, exists := persona.GetPresetPersona(req.Id); exists {
		http.Error(w, `{"error":"Cannot overwrite built-in preset persona"}`, http.StatusConflict)
		return
	}

	if req.Name == "" || req.Directive == "" {
		http.Error(w, `{"error":"Name and Directive are required"}`, http.StatusBadRequest)
		return
	}

	if req.Role == "" {
		req.Role = "Custom AI Persona"
	}
	if req.Icon == "" {
		req.Icon = "robot"
	}
	if req.Color == "" {
		req.Color = "var(--accent-blue, #3b82f6)"
	}

	tagsBytes, _ := json.Marshal(req.Tags)

	if h.db != nil {
		row := db.CustomPersonaRow{
			Id:          req.Id,
			Name:        req.Name,
			Role:        req.Role,
			Icon:        req.Icon,
			Color:       req.Color,
			Description: req.Description,
			Directive:   req.Directive,
			Tags:        string(tagsBytes),
		}
		if err := h.db.SaveCustomPersona(row); err != nil {
			http.Error(w, `{"error":"Failed to save custom persona"}`, http.StatusInternalServerError)
			return
		}
	}

	created := persona.PersonaDefinition{
		Id:          req.Id,
		Name:        req.Name,
		Role:        req.Role,
		Icon:        req.Icon,
		Color:       req.Color,
		Description: req.Description,
		Directive:   req.Directive,
		IsPreset:    false,
		Tags:        req.Tags,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(created)
}

// SetSessionPersona handles POST /api/sessions/{sessionId}/persona.
func (h *PersonasHandler) SetSessionPersona(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := h.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	var req SetSessionPersonaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.PersonaId) == "" {
		http.Error(w, `{"error":"PersonaId is required"}`, http.StatusBadRequest)
		return
	}

	personaId := strings.TrimSpace(req.PersonaId)

	// Validate persona exists
	found := false
	if _, isPreset := persona.GetPresetPersona(personaId); isPreset {
		found = true
	} else if h.db != nil {
		if cp, err := h.db.GetCustomPersona(personaId); err == nil && cp != nil {
			found = true
		}
	}

	if !found {
		http.Error(w, `{"error":"Persona not found"}`, http.StatusNotFound)
		return
	}

	if h.db != nil {
		token := h.auth.ExtractToken(r)
		if token == "" {
			token = "default"
		}
		tokenHash := h.auth.TokenHash(token)
		_ = h.db.SaveSetting(tokenHash, "session_persona:"+sessionName, personaId)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":          true,
		"sessionName": sessionName,
		"personaId":   personaId,
	})
}
