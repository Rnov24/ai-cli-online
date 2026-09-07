package routes

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
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

func TestFileHandler_DownloadCwd_Symlink(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-download-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	targetFile := filepath.Join(tempDir, "target.txt")
	if err := os.WriteFile(targetFile, []byte("target file content"), 0644); err != nil {
		t.Fatalf("Failed to write target file: %v", err)
	}

	symlinkPath := filepath.Join(tempDir, "link_to_target.txt")
	if err := os.Symlink("target.txt", symlinkPath); err != nil {
		t.Fatalf("Failed to create symlink: %v", err)
	}

	cfg := &config.Config{
		DefaultWorkingDir: tempDir,
	}
	auth := NewAuthHelper(cfg)
	fileH := NewFileHandler(auth)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/tab-1/download-cwd", nil)
	req.SetPathValue("sessionId", "tab-1")
	w := httptest.NewRecorder()

	fileH.DownloadCwd(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d (body: %s)", w.Code, w.Body.String())
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "application/gzip" {
		t.Errorf("Expected Content-Type application/gzip, got %s", contentType)
	}

	gzr, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatalf("Failed to create gzip reader: %v", err)
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	foundEntries := make(map[string]*tar.Header)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("Error reading tar entry: %v", err)
		}
		foundEntries[header.Name] = header

		if header.Typeflag == tar.TypeReg {
			var content bytes.Buffer
			if _, err := io.Copy(&content, tr); err != nil {
				t.Fatalf("Failed to read file content for %s: %v", header.Name, err)
			}
			if header.Name == "target.txt" && content.String() != "target file content" {
				t.Errorf("Unexpected content for target.txt: %s", content.String())
			}
		}
	}

	linkHeader, ok := foundEntries["link_to_target.txt"]
	if !ok {
		t.Fatalf("Symlink link_to_target.txt not found in tar archive")
	}
	if linkHeader.Typeflag != tar.TypeSymlink {
		t.Errorf("Expected tar.TypeSymlink, got %v", linkHeader.Typeflag)
	}
	if linkHeader.Linkname != "target.txt" {
		t.Errorf("Expected link target 'target.txt', got %q", linkHeader.Linkname)
	}

	if _, ok := foundEntries["target.txt"]; !ok {
		t.Fatalf("target.txt not found in tar archive")
	}
}
