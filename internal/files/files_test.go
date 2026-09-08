package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFilesSecurityAndListing(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-files-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	subDir := filepath.Join(tempDir, "subdir")
	_ = os.MkdirAll(subDir, 0755)

	f1 := filepath.Join(tempDir, "file1.txt")
	f2 := filepath.Join(subDir, "file2.txt")
	_ = os.WriteFile(f1, []byte("content 1"), 0644)
	_ = os.WriteFile(f2, []byte("content 2"), 0644)

	// Test ListFiles
	listRes, err := ListFiles(tempDir)
	if err != nil {
		t.Fatalf("ListFiles failed: %v", err)
	}
	if len(listRes.Files) != 2 {
		t.Errorf("Expected 2 entries, got %d", len(listRes.Files))
	}
	// Directory should be first
	if listRes.Files[0].Type != "directory" {
		t.Errorf("Expected directory first, got %s", listRes.Files[0].Type)
	}

	// Test ValidatePath success
	p, err := ValidatePath("file1.txt", tempDir)
	if err != nil || p != f1 {
		t.Errorf("ValidatePath failed: %v, got %s", err, p)
	}

	// Test ValidatePath traversal block
	_, err = ValidatePath("../../../etc/passwd", tempDir)
	if err == nil {
		t.Errorf("Expected path traversal to fail")
	}

	// Test ValidateNewPath
	newP, err := ValidateNewPath("newfile.txt", tempDir)
	if err != nil || newP != filepath.Join(tempDir, "newfile.txt") {
		t.Errorf("ValidateNewPath failed: %v, got %s", err, newP)
	}
}

func TestAtomicWriteFile(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-atomic-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	targetFile := filepath.Join(tempDir, "data.json")

	// 1. Write initial content
	initialData := []byte(`{"version": 1}`)
	if err := AtomicWriteFile(targetFile, initialData, 0644); err != nil {
		t.Fatalf("AtomicWriteFile failed on initial write: %v", err)
	}

	readBack, err := os.ReadFile(targetFile)
	if err != nil || string(readBack) != string(initialData) {
		t.Errorf("Expected %q, got %q (err: %v)", string(initialData), string(readBack), err)
	}

	// 2. Overwrite atomically with new content
	updatedData := []byte(`{"version": 2, "status": "ok"}`)
	if err := AtomicWriteFile(targetFile, updatedData, 0644); err != nil {
		t.Fatalf("AtomicWriteFile failed on overwrite: %v", err)
	}

	readBack, err = os.ReadFile(targetFile)
	if err != nil || string(readBack) != string(updatedData) {
		t.Errorf("Expected %q, got %q (err: %v)", string(updatedData), string(readBack), err)
	}

	// 3. Verify no temporary files remain
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "data.json" {
		t.Errorf("Expected exactly 1 file data.json, found: %v", entries)
	}
}

func TestValidateNewPath_AncestorSymlink(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-symlink-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	outsideDir, err := os.MkdirTemp("", "ai-cli-outside-*")
	if err != nil {
		t.Fatalf("Failed to create outside dir: %v", err)
	}
	defer os.RemoveAll(outsideDir)

	// Create symlink inside tempDir pointing to outsideDir
	symlinkPath := filepath.Join(tempDir, "link_to_outside")
	if err := os.Symlink(outsideDir, symlinkPath); err != nil {
		t.Fatalf("Failed to create symlink: %v", err)
	}

	// ValidateNewPath targeting a file inside the symlinked ancestor must fail
	_, err = ValidateNewPath("link_to_outside/escape.txt", tempDir)
	if err == nil {
		t.Errorf("Expected ValidateNewPath to reject path traversing through ancestor symlink")
	}
}

