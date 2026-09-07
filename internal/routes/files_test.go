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
)

func TestFileHandler_Rm_Guards(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-files-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	subDir := filepath.Join(tempDir, "testsubdir")
	if err := os.Mkdir(subDir, 0755); err != nil {
		t.Fatalf("Failed to create test subdir: %v", err)
	}
	testFile := filepath.Join(subDir, "file.txt")
	if err := os.WriteFile(testFile, []byte("hello"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	cfg := &config.Config{
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	fileH := NewFileHandler(auth)

	// 1. Calling Rm with "." or "./" returns HTTP 400 with error message
	for _, badPath := range []string{".", "./"} {
		body, _ := json.Marshal(map[string]string{"path": badPath})
		req := httptest.NewRequest(http.MethodPost, "/api/sessions/tab-1/files/rm", bytes.NewReader(body))
		req.SetPathValue("sessionId", "tab-1")
		w := httptest.NewRecorder()

		fileH.Rm(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Path %q: expected 400, got %d", badPath, w.Code)
		}
		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "Invalid path" {
			t.Errorf("Path %q: expected error 'Invalid path', got %v", badPath, resp["error"])
		}
	}

	// 2. Calling Rm with workspace root path returns HTTP 400
	for _, rootPath := range []string{tempDir, tempDir + "/"} {
		body, _ := json.Marshal(map[string]string{"path": rootPath})
		req := httptest.NewRequest(http.MethodPost, "/api/sessions/tab-1/files/rm", bytes.NewReader(body))
		req.SetPathValue("sessionId", "tab-1")
		w := httptest.NewRecorder()

		fileH.Rm(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Root path %q: expected 400, got %d", rootPath, w.Code)
		}
		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "Cannot delete workspace or home directory root" {
			t.Errorf("Root path %q: expected error 'Cannot delete workspace or home directory root', got %v", rootPath, resp["error"])
		}
	}

	// 3. Calling Rm with a valid subdirectory or file under cwd succeeds
	body, _ := json.Marshal(map[string]string{"path": "testsubdir/file.txt"})
	req := httptest.NewRequest(http.MethodPost, "/api/sessions/tab-1/files/rm", bytes.NewReader(body))
	req.SetPathValue("sessionId", "tab-1")
	w := httptest.NewRecorder()

	fileH.Rm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Valid file: expected 200, got %d (body: %s)", w.Code, w.Body.String())
	}
	if _, err := os.Stat(testFile); !os.IsNotExist(err) {
		t.Errorf("Expected file to be deleted")
	}

	body, _ = json.Marshal(map[string]string{"path": "testsubdir"})
	req = httptest.NewRequest(http.MethodPost, "/api/sessions/tab-1/files/rm", bytes.NewReader(body))
	req.SetPathValue("sessionId", "tab-1")
	w = httptest.NewRecorder()

	fileH.Rm(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Valid subdir: expected 200, got %d (body: %s)", w.Code, w.Body.String())
	}
	if _, err := os.Stat(subDir); !os.IsNotExist(err) {
		t.Errorf("Expected subdir to be deleted")
	}
}
