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
