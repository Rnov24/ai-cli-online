package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/agy-online/internal/config"
)

func TestPluginsHandler(t *testing.T) {
	// Setup isolated temporary HOME and USERPROFILE
	origHome := os.Getenv("HOME")
	origUserProfile := os.Getenv("USERPROFILE")
	tmpHome, err := os.MkdirTemp("", "plugins-test-home-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer func() {
		_ = os.Setenv("HOME", origHome)
		_ = os.Setenv("USERPROFILE", origUserProfile)
		_ = os.RemoveAll(tmpHome)
	}()
	_ = os.Setenv("HOME", tmpHome)
	_ = os.Setenv("USERPROFILE", tmpHome)

	// Create .gemini/config/import_manifest.json
	configDir := filepath.Join(tmpHome, ".gemini", "config")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("failed to create config dir: %v", err)
	}

	manifestJSON := `{
  "imports": [
    {
      "name": "ai-cli-task",
      "source": "antigravity",
      "importedAt": "2026-09-03T17:51:23Z",
      "components": ["skills", "commands"]
    }
  ]
}`
	if err := os.WriteFile(filepath.Join(configDir, "import_manifest.json"), []byte(manifestJSON), 0644); err != nil {
		t.Fatalf("failed to write import_manifest.json: %v", err)
	}

	// Create plugin dir: ~/.gemini/config/plugins/ai-cli-task
	pluginDir := filepath.Join(configDir, "plugins", "ai-cli-task")
	skillsDir := filepath.Join(pluginDir, "skills", "init")
	commandsDir := filepath.Join(pluginDir, "commands")
	if err := os.MkdirAll(skillsDir, 0755); err != nil {
		t.Fatalf("failed to create plugin dirs: %v", err)
	}
	if err := os.MkdirAll(commandsDir, 0755); err != nil {
		t.Fatalf("failed to create commands dir: %v", err)
	}

	pluginJSON := `{
  "name": "ai-cli-task",
  "version": "0.3.6",
  "description": "Task lifecycle management for Antigravity CLI",
  "author": { "name": "huacheng" },
  "skills": "./skills/",
  "commands": "./commands/"
}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(pluginJSON), 0644); err != nil {
		t.Fatalf("failed to write plugin.json: %v", err)
	}

	// Write dummy SKILL.md and dummy command
	if err := os.WriteFile(filepath.Join(skillsDir, "SKILL.md"), []byte("---\nname: init\n---\nInit skill"), 0644); err != nil {
		t.Fatalf("failed to write SKILL.md: %v", err)
	}
	if err := os.WriteFile(filepath.Join(commandsDir, "task.md"), []byte("# Task command"), 0644); err != nil {
		t.Fatalf("failed to write command file: %v", err)
	}

	cfg := &config.Config{AuthToken: "test-plugin-token"}
	auth := NewAuthHelper(cfg)
	handler := NewPluginsHandler(auth)

	// 1. Unauthorized test
	t.Run("Unauthorized request", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/plugins", nil)
		w := httptest.NewRecorder()
		handler.ListPlugins(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
		}
	})

	// 2. List plugins test
	t.Run("List plugins returns parsed plugin item", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/plugins", nil)
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.ListPlugins(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var resp PluginsResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Count != 1 {
			t.Fatalf("expected 1 plugin, got %d", resp.Count)
		}

		p := resp.Plugins[0]
		if p.Name != "ai-cli-task" {
			t.Errorf("expected name ai-cli-task, got %s", p.Name)
		}
		if p.Version != "0.3.6" {
			t.Errorf("expected version 0.3.6, got %s", p.Version)
		}
		if p.Author != "huacheng" {
			t.Errorf("expected author huacheng, got %s", p.Author)
		}
		if !p.Enabled {
			t.Errorf("expected enabled to be true")
		}
		if !p.HasSkills || p.SkillsCount != 1 {
			t.Errorf("expected HasSkills=true and SkillsCount=1, got %v and %d", p.HasSkills, p.SkillsCount)
		}
		if !p.HasCommands {
			t.Errorf("expected HasCommands=true")
		}
	})

	// 3. Get plugin details
	t.Run("Get plugin detail", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/plugins/ai-cli-task", nil)
		req.SetPathValue("name", "ai-cli-task")
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.GetPlugin(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
		}

		var item PluginItem
		if err := json.NewDecoder(w.Body).Decode(&item); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if item.Name != "ai-cli-task" || item.Version != "0.3.6" {
			t.Errorf("unexpected plugin details: %+v", item)
		}
	})

	// 4. Get non-existent plugin returns 404
	t.Run("Get non-existent plugin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/plugins/nonexistent", nil)
		req.SetPathValue("name", "nonexistent")
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.GetPlugin(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found, got %d", w.Code)
		}
	})

	// 5. Invalid name path traversal returns 400
	t.Run("Get plugin with path traversal returns 400", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/plugins/..%2F..", nil)
		req.SetPathValue("name", "../../etc/passwd")
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.GetPlugin(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})

	// 6. Test InstallPlugin input validation
	t.Run("InstallPlugin requires non-empty target", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/plugins/install", bytes.NewBufferString(`{"target":""}`))
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.InstallPlugin(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})

	// 7. Test UninstallPlugin input validation
	t.Run("UninstallPlugin validates plugin name", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/plugins/uninstall", bytes.NewBufferString(`{"name":"invalid/path"}`))
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.UninstallPlugin(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})

	// 8. Test TogglePlugin input validation
	t.Run("TogglePlugin validates plugin name", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/plugins/toggle", bytes.NewBufferString(`{"name":"invalid/name","enable":true}`))
		req.Header.Set("Authorization", "Bearer test-plugin-token")
		w := httptest.NewRecorder()
		handler.TogglePlugin(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})
}
