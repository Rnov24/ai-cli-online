package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
	"github.com/huacheng/ai-cli-online/internal/terminal"
)

func setupTestGitRepo(t *testing.T) (string, string, string) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "ai-cli-git-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	runCmd := func(args ...string) string {
		cmd := exec.Command("git", args...)
		cmd.Dir = tempDir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test User",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test User",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s failed: %v, output: %s", strings.Join(args, " "), err, string(out))
		}
		return strings.TrimSpace(string(out))
	}

	runCmd("init", "-b", "main")
	runCmd("config", "user.name", "Test User")
	runCmd("config", "user.email", "test@example.com")

	// Commit 1: Initial root commit
	_ = os.WriteFile(filepath.Join(tempDir, "README.md"), []byte("# Title\nInitial content\n"), 0644)
	runCmd("add", "README.md")
	runCmd("commit", "-m", "feat: initial commit")
	rootHash := runCmd("rev-parse", "HEAD")

	// Commit 2: Add second file and update readme
	_ = os.WriteFile(filepath.Join(tempDir, "README.md"), []byte("# Title\nUpdated content\nSecond line\n"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "app.go"), []byte("package main\n\nfunc main() {}\n"), 0644)
	runCmd("add", "README.md", "app.go")
	runCmd("commit", "-m", "feat: add app.go and update readme")
	secondHash := runCmd("rev-parse", "HEAD")

	// Create feature branch
	runCmd("branch", "feature-x")

	return tempDir, rootHash, secondHash
}

func TestGitRoutes(t *testing.T) {
	repoDir, rootHash, secondHash := setupTestGitRepo(t)
	defer os.RemoveAll(repoDir)

	token := "test-git-token"
	cfg := &config.Config{
		AuthToken:         token,
		DefaultWorkingDir: repoDir,
	}
	auth := NewAuthHelper(cfg)
	gitH := NewGitHandler(auth)

	sessionId := "git-test-session"
	sessionName := terminal.BuildSessionName(token, sessionId)
	_ = sessionName

	t.Run("Unauthorized requests return 401", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log", nil)
		w := httptest.NewRecorder()
		gitH.GitLog(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", w.Code)
		}

		req = httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit="+secondHash, nil)
		w = httptest.NewRecorder()
		gitH.GitDiff(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", w.Code)
		}

		req = httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-branches", nil)
		w = httptest.NewRecorder()
		gitH.GitBranches(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", w.Code)
		}
	})

	t.Run("GitLog returns commits with stats and pagination", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log?limit=10", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitLog(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Commits []CommitInfo `json:"commits"`
			HasMore bool         `json:"hasMore"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse json: %v", err)
		}

		if len(resp.Commits) != 2 {
			t.Fatalf("Expected 2 commits, got %d", len(resp.Commits))
		}

		// Most recent commit should be first
		if resp.Commits[0].Hash != secondHash {
			t.Errorf("Expected commit 0 hash to be %s, got %s", secondHash, resp.Commits[0].Hash)
		}
		if resp.Commits[0].Message != "feat: add app.go and update readme" {
			t.Errorf("Unexpected message: %s", resp.Commits[0].Message)
		}
		if len(resp.Commits[0].Files) != 2 {
			t.Errorf("Expected 2 modified files in commit 0, got %d", len(resp.Commits[0].Files))
		}

		// Initial commit
		if resp.Commits[1].Hash != rootHash {
			t.Errorf("Expected commit 1 hash to be %s, got %s", rootHash, resp.Commits[1].Hash)
		}
	})

	t.Run("GitLog with file filter returns only commits touching file", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log?file=app.go", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitLog(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}

		var resp struct {
			Commits []CommitInfo `json:"commits"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Commits) != 1 || resp.Commits[0].Hash != secondHash {
			t.Errorf("Expected only second commit touching app.go, got %d commits", len(resp.Commits))
		}
	})

	t.Run("GitLog with q (commit message) filter returns matching commits", func(t *testing.T) {
		// Search for "initial"
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log?q=initial", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitLog(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}

		var resp struct {
			Commits []CommitInfo `json:"commits"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Commits) != 1 || resp.Commits[0].Hash != rootHash {
			t.Fatalf("Expected only root commit for q=initial, got %d", len(resp.Commits))
		}

		// Search for non-existent commit message
		req = httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log?q=nonexistent-query-xyz", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()

		gitH.GitLog(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", w.Code)
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Commits) != 0 {
			t.Errorf("Expected 0 commits for nonexistent query, got %d", len(resp.Commits))
		}

		// Query with control character should be rejected
		req = httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log?q=foo%0Abar", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()

		gitH.GitLog(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request for query with newline, got %d", w.Code)
		}
	})

	t.Run("GitDiff for normal commit returns patch against parent", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit="+secondHash, nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitDiff(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		diff := resp["diff"]
		if !strings.Contains(diff, "app.go") || !strings.Contains(diff, "func main()") {
			t.Errorf("Expected diff to contain app.go content, got:\n%s", diff)
		}
	})

	t.Run("GitDiff for initial root commit returns files created in commit", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit="+rootHash, nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitDiff(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		diff := resp["diff"]
		if !strings.Contains(diff, "README.md") || !strings.Contains(diff, "+Initial content") {
			t.Errorf("Expected root diff to contain initial content of README.md, got:\n%s", diff)
		}
	})

	t.Run("GitDiff with fileFilter limits output to requested file", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit="+secondHash+"&file=README.md", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitDiff(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		diff := resp["diff"]
		if !strings.Contains(diff, "README.md") || strings.Contains(diff, "app.go") {
			t.Errorf("Expected diff to contain only README.md, got:\n%s", diff)
		}
	})

	t.Run("GitDiff rejects path traversal and invalid hash", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit=bad;command", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		gitH.GitDiff(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 for bad commit, got %d", w.Code)
		}

		req = httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-diff?commit="+secondHash+"&file=../secret", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		gitH.GitDiff(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 for file traversal, got %d", w.Code)
		}
	})

	t.Run("GitBranches returns branch list and current branch", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-branches", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		gitH.GitBranches(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Current  string   `json:"current"`
			Branches []string `json:"branches"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Current != "main" {
			t.Errorf("Expected current branch 'main', got %q", resp.Current)
		}
		hasFeature := false
		for _, b := range resp.Branches {
			if b == "feature-x" {
				hasFeature = true
			}
		}
		if !hasFeature {
			t.Errorf("Expected feature-x in branches list, got: %v", resp.Branches)
		}
	})

	t.Run("Non-git directory returns graceful empty result", func(t *testing.T) {
		emptyDir, _ := os.MkdirTemp("", "non-git-*")
		defer os.RemoveAll(emptyDir)

		nonGitCfg := &config.Config{
			AuthToken:         token,
			DefaultWorkingDir: emptyDir,
		}
		nonGitAuth := NewAuthHelper(nonGitCfg)
		nonGitHandler := NewGitHandler(nonGitAuth)

		req := httptest.NewRequest("GET", "/api/sessions/"+sessionId+"/git-log", nil)
		req.SetPathValue("sessionId", sessionId)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		nonGitHandler.GitLog(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("Expected 200, got %d", w.Code)
		}
		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "Not a git repository" {
			t.Errorf("Expected 'Not a git repository' error, got %v", resp["error"])
		}
	})
}
