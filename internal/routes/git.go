package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/huacheng/ai-cli-online/internal/terminal"
)

type GitHandler struct {
	auth *AuthHelper
}

func NewGitHandler(auth *AuthHelper) *GitHandler {
	return &GitHandler{auth: auth}
}

type CommitFile struct {
	Path      string `json:"path"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type RefInfo struct {
	Type string `json:"type"` // "head" | "branch" | "remote" | "tag"
	Name string `json:"name"`
}

type CommitInfo struct {
	Hash      string       `json:"hash"`
	ShortHash string       `json:"shortHash"`
	Parents   []string     `json:"parents"`
	Refs      []RefInfo    `json:"refs"`
	Message   string       `json:"message"`
	Author    string       `json:"author"`
	Date      string       `json:"date"`
	Files     []CommitFile `json:"files"`
}

var (
	validHashRe   = regexp.MustCompile(`^[a-f0-9]{7,40}$`)
	validBranchRe = regexp.MustCompile(`^[\w\-\/.]+$`)
)

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return "", err
	}
	return stdout.String(), nil
}

func (g *GitHandler) GitLog(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := g.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, g.auth.cfg.DefaultWorkingDir)

	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}

	limit := 30
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			if v > 100 {
				v = 100
			}
			limit = v
		}
	}

	fileFilter := r.URL.Query().Get("file")
	if fileFilter != "" && (strings.Contains(fileFilter, "..") || strings.HasPrefix(fileFilter, "/")) {
		http.Error(w, `{"error":"Invalid file path"}`, http.StatusBadRequest)
		return
	}

	all := r.URL.Query().Get("all") == "true"
	branch := r.URL.Query().Get("branch")
	if branch != "" && !validBranchRe.MatchString(branch) {
		http.Error(w, `{"error":"Invalid branch name"}`, http.StatusBadRequest)
		return
	}

	skip := (page - 1) * limit
	sep := "---GIT-LOG-SEP---"
	format := sep + "%n%H%n%h%n%P%n%D%n%s%n%an%n%aI"

	args := []string{
		"log",
		"--topo-order",
		"--pretty=format:" + format,
		"--numstat",
		fmt.Sprintf("--skip=%d", skip),
		fmt.Sprintf("-%d", limit+1),
	}
	if all {
		args = append(args[:1], append([]string{"--all"}, args[1:]...)...)
	}
	if branch != "" && !all {
		args = append(args, branch)
	}
	if fileFilter != "" {
		args = append(args, "--", fileFilter)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	stdout, err := runGit(ctx, cwd, args...)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"commits": []any{}, "hasMore": false, "error": "Not a git repository"})
		return
	}

	blocks := strings.Split(stdout, sep)
	var commits []CommitInfo

	for _, block := range blocks {
		trimmed := strings.TrimSpace(block)
		if trimmed == "" {
			continue
		}
		rawLines := strings.Split(trimmed, "\n")
		if len(rawLines) < 7 {
			continue
		}

		hash := rawLines[0]
		shortHash := rawLines[1]
		parentLine := strings.TrimSpace(rawLines[2])
		refLine := strings.TrimSpace(rawLines[3])
		message := rawLines[4]
		author := rawLines[5]
		date := rawLines[6]
		fileLines := rawLines[7:]

		var parents []string
		if parentLine != "" {
			parents = strings.Fields(parentLine)
		}

		var refs []RefInfo
		if refLine != "" {
			parts := strings.Split(refLine, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				if strings.HasPrefix(p, "HEAD -> ") {
					refs = append(refs, RefInfo{Type: "head", Name: strings.TrimPrefix(p, "HEAD -> ")})
				} else if p == "HEAD" {
					refs = append(refs, RefInfo{Type: "head", Name: "HEAD"})
				} else if strings.HasPrefix(p, "tag: ") {
					refs = append(refs, RefInfo{Type: "tag", Name: strings.TrimPrefix(p, "tag: ")})
				} else if strings.Contains(p, "/") {
					refs = append(refs, RefInfo{Type: "remote", Name: p})
				} else {
					refs = append(refs, RefInfo{Type: "branch", Name: p})
				}
			}
		}

		var commitFiles []CommitFile
		for _, fl := range fileLines {
			fl = strings.TrimSpace(fl)
			fields := strings.Split(fl, "\t")
			if len(fields) == 3 {
				adds, _ := strconv.Atoi(fields[0])
				dels, _ := strconv.Atoi(fields[1])
				commitFiles = append(commitFiles, CommitFile{
					Additions: adds,
					Deletions: dels,
					Path:      fields[2],
				})
			}
		}

		commits = append(commits, CommitInfo{
			Hash:      hash,
			ShortHash: shortHash,
			Parents:   parents,
			Refs:      refs,
			Message:   message,
			Author:    author,
			Date:      date,
			Files:     commitFiles,
		})
	}

	hasMore := len(commits) > limit
	if hasMore {
		commits = commits[:limit]
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"commits": commits,
		"hasMore": hasMore,
	})
}

func (g *GitHandler) GitDiff(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := g.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	commit := r.URL.Query().Get("commit")
	if commit == "" || !validHashRe.MatchString(commit) {
		http.Error(w, `{"error":"Invalid commit hash"}`, http.StatusBadRequest)
		return
	}

	fileFilter := r.URL.Query().Get("file")
	if fileFilter != "" && (strings.Contains(fileFilter, "..") || strings.HasPrefix(fileFilter, "/")) {
		http.Error(w, `{"error":"Invalid file path"}`, http.StatusBadRequest)
		return
	}

	cwd := terminal.GetCwd(sessionName, g.auth.cfg.DefaultWorkingDir)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var args []string
	if _, err := runGit(ctx, cwd, "rev-parse", commit+"~1"); err == nil {
		args = []string{"diff", commit + "~1", commit}
	} else {
		args = []string{"diff", "--root", commit}
	}

	if fileFilter != "" {
		args = append(args, "--", fileFilter)
	}

	diff, err := runGit(ctx, cwd, args...)
	if err != nil {
		http.Error(w, `{"error":"Failed to get diff"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"diff": diff})
}

func (g *GitHandler) GitBranches(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	sessionName := g.auth.ResolveSession(w, r, sessionId)
	if sessionName == "" {
		return
	}

	cwd := terminal.GetCwd(sessionName, g.auth.cfg.DefaultWorkingDir)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	stdout, err := runGit(ctx, cwd, "branch", "-a", "--no-color")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"current": "", "branches": []string{}})
		return
	}

	var branches []string
	current := ""
	for _, line := range strings.Split(stdout, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "* ") {
			current = trimmed[2:]
			branches = append(branches, current)
		} else {
			branches = append(branches, trimmed)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"current": current, "branches": branches})
}
