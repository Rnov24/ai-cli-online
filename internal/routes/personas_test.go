package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/huacheng/agy-online/internal/config"
	"github.com/huacheng/agy-online/internal/db"
	"github.com/huacheng/agy-online/internal/persona"
)

func TestPersonasHandler(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "persona-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	database, err := db.Open(tmpDir)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	cfg := &config.Config{AuthToken: "persona-token"}
	auth := NewAuthHelper(cfg)
	handler := NewPersonasHandler(auth, database)

	// 1. Unauthorized test
	t.Run("Unauthorized request", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/personas", nil)
		w := httptest.NewRecorder()
		handler.ListPersonas(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	// 2. List presets
	t.Run("List personas returns presets", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/personas", nil)
		req.Header.Set("Authorization", "Bearer persona-token")
		w := httptest.NewRecorder()
		handler.ListPersonas(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp PersonasResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Count < 6 {
			t.Fatalf("expected at least 6 personas, got %d", resp.Count)
		}

		foundArch := false
		for _, p := range resp.Personas {
			if p.Id == "architect" {
				foundArch = true
				if !p.IsPreset {
					t.Errorf("expected architect to be preset")
				}
			}
		}
		if !foundArch {
			t.Errorf("expected architect in personas list")
		}
	})

	// 3. Get persona detail
	t.Run("Get persona detail", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/personas/architect", nil)
		req.SetPathValue("id", "architect")
		req.Header.Set("Authorization", "Bearer persona-token")
		w := httptest.NewRecorder()
		handler.GetPersona(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}

		var item persona.PersonaDefinition
		if err := json.NewDecoder(w.Body).Decode(&item); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if item.Id != "architect" || item.Name != "System Architect" {
			t.Errorf("unexpected persona: %+v", item)
		}
	})

	// 4. Create custom persona
	t.Run("Create custom persona", func(t *testing.T) {
		createBody := `{
			"id": "my-custom-reviewer",
			"name": "Code Reviewer",
			"role": "Thorough Code Review",
			"directive": "Review all pull requests for clean code and readability.",
			"tags": ["review", "clean-code"]
		}`
		req := httptest.NewRequest("POST", "/api/personas", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer persona-token")
		w := httptest.NewRecorder()
		handler.CreateCustomPersona(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
		}

		// Verify it appears in ListPersonas
		reqList := httptest.NewRequest("GET", "/api/personas", nil)
		reqList.Header.Set("Authorization", "Bearer persona-token")
		wList := httptest.NewRecorder()
		handler.ListPersonas(wList, reqList)

		var resp PersonasResponse
		_ = json.NewDecoder(wList.Body).Decode(&resp)

		foundCustom := false
		for _, p := range resp.Personas {
			if p.Id == "my-custom-reviewer" {
				foundCustom = true
				if p.IsPreset {
					t.Errorf("expected custom persona to have IsPreset=false")
				}
				if len(p.Tags) != 2 {
					t.Errorf("expected 2 tags, got %v", p.Tags)
				}
			}
		}
		if !foundCustom {
			t.Errorf("custom persona not found in ListPersonas")
		}
	})

	// 5. Cannot overwrite preset
	t.Run("Cannot overwrite preset", func(t *testing.T) {
		createBody := `{
			"id": "architect",
			"name": "Fake Architect",
			"directive": "Do nothing."
		}`
		req := httptest.NewRequest("POST", "/api/personas", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer persona-token")
		w := httptest.NewRecorder()
		handler.CreateCustomPersona(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict, got %d", w.Code)
		}
	})
}
