package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/db"
)

func setupTestWorkspaceHandler(t *testing.T) (*WorkspaceHandler, string, func()) {
	tempDir, err := os.MkdirTemp("", "ws-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	database, err := db.Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}

	cfg := &config.Config{
		AuthToken:         "",
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	handler := NewWorkspaceHandler(auth, database)

	cleanup := func() {
		_ = database.Close()
		_ = os.RemoveAll(tempDir)
	}

	return handler, tempDir, cleanup
}

func TestWorkspaceRoutes(t *testing.T) {
	handler, tempDir, cleanup := setupTestWorkspaceHandler(t)
	defer cleanup()

	// 1. Initial ListWorkspaces (empty db)
	req := httptest.NewRequest("GET", "/api/workspaces", nil)
	rec := httptest.NewRecorder()
	handler.ListWorkspaces(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got: %d", rec.Code)
	}

	var res WorkspacesResponse
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if res.Home == "" {
		t.Errorf("Expected non-empty Home in response")
	}

	// 2. Create Workspace with valid temp sub-directory
	subDir := filepath.Join(tempDir, "my-cool-project")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("Failed to create subDir: %v", err)
	}

	createPayload := map[string]string{
		"path": subDir,
		"name": "My Cool Project",
	}
	bodyBytes, _ := json.Marshal(createPayload)
	req = httptest.NewRequest("POST", "/api/workspaces", bytes.NewReader(bodyBytes))
	rec = httptest.NewRecorder()
	handler.CreateWorkspace(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created, got: %d, body: %s", rec.Code, rec.Body.String())
	}

	var created db.Workspace
	_ = json.NewDecoder(rec.Body).Decode(&created)
	if created.Name != "My Cool Project" || created.Path != filepath.Clean(subDir) {
		t.Errorf("Unexpected created workspace: %+v", created)
	}

	// 3. Create Workspace with invalid path -> 400 Bad Request
	invalidPayload := map[string]string{
		"path": filepath.Join(tempDir, "non_existent_folder_xyz"),
	}
	bodyBytes, _ = json.Marshal(invalidPayload)
	req = httptest.NewRequest("POST", "/api/workspaces", bytes.NewReader(bodyBytes))
	rec = httptest.NewRecorder()
	handler.CreateWorkspace(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for non-existent dir, got: %d", rec.Code)
	}

	// 4. Delete Workspace - Home protection
	req = httptest.NewRequest("DELETE", "/api/workspaces/home", nil)
	req.SetPathValue("id", "home")
	rec = httptest.NewRecorder()
	handler.DeleteWorkspace(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request when deleting home, got: %d", rec.Code)
	}

	// 5. Delete Workspace - Custom Project
	req = httptest.NewRequest("DELETE", "/api/workspaces/"+created.Id, nil)
	req.SetPathValue("id", created.Id)
	rec = httptest.NewRecorder()
	handler.DeleteWorkspace(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected 200 OK when deleting project, got: %d", rec.Code)
	}
}
