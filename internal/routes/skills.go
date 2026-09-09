package routes

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/huacheng/agy-online/internal/db"
	"github.com/huacheng/agy-online/internal/persona"
)

type SkillItem struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Scope        string   `json:"scope"` // "workspace", "global", "builtin"
	Path         string   `json:"path"`
	SkillFile    string   `json:"skillFile"`
	HasScripts   bool     `json:"hasScripts"`
	HasResources bool     `json:"hasResources"`
	Tags         []string `json:"tags,omitempty"`
}

type SkillsResponse struct {
	WorkspacePath string      `json:"workspacePath"`
	IsHome        bool        `json:"isHome"`
	Skills        []SkillItem `json:"skills"`
	Count         int         `json:"count"`
	Total         int         `json:"total"`
	Page          int         `json:"page"`
	Limit         int         `json:"limit"`
	TotalPages    int         `json:"totalPages"`
}

type SkillContentResponse struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
	Path        string `json:"path"`
	Scope       string `json:"scope"`
}

type ScaffoldSkillRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Scope       string `json:"scope"` // "workspace" or "global"
	Cwd         string `json:"cwd"`
}

type RemoteSkillItem struct {
	ID       string `json:"id"`
	SkillID  string `json:"skillId"`
	Name     string `json:"name"`
	Source   string `json:"source"`
	Installs int    `json:"installs"`
}

type SkillsSearchResponse struct {
	Query      string            `json:"query"`
	Skills     []RemoteSkillItem `json:"skills"`
	Count      int               `json:"count"`
	Total      int               `json:"total"`
	Page       int               `json:"page"`
	Limit      int               `json:"limit"`
	TotalPages int               `json:"totalPages"`
}

type InstallSkillRequest struct {
	Source    string `json:"source"`    // e.g. "miqdadbadjuber/anti-slop" or "shadcn/improve"
	SkillName string `json:"skillName"` // e.g. "antislop", or empty to infer
	Scope     string `json:"scope"`     // "workspace" or "global"
	Cwd       string `json:"cwd"`
}

type SkillLockEntry struct {
	Source       string `json:"source"`
	SourceType   string `json:"sourceType"`
	SkillPath    string `json:"skillPath"`
	ComputedHash string `json:"computedHash"`
}

type SkillLockFile struct {
	Version int                       `json:"version"`
	Skills  map[string]SkillLockEntry `json:"skills"`
}

type SyncSkillsResponse struct {
	Synced   int      `json:"synced"`
	Restored []string `json:"restored"`
	Errors   []string `json:"errors,omitempty"`
}

var validSkillNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

var curatedPopularSkills = []RemoteSkillItem{
	{
		ID:       "miqdadbadjuber/anti-slop/antislop",
		SkillID:  "antislop",
		Name:     "antislop",
		Source:   "miqdadbadjuber/anti-slop",
		Installs: 946,
	},
	{
		ID:       "shadcn/improve/improve",
		SkillID:  "improve",
		Name:     "improve",
		Source:   "shadcn/improve",
		Installs: 4200,
	},
	{
		ID:       "github/awesome-copilot/prd",
		SkillID:  "prd",
		Name:     "prd",
		Source:   "github/awesome-copilot",
		Installs: 1800,
	},
	{
		ID:       "mattpocock/skills/to-tickets",
		SkillID:  "to-tickets",
		Name:     "to-tickets",
		Source:   "mattpocock/skills",
		Installs: 3100,
	},
	{
		ID:       "cameronmcgear/git-commit/git-commit",
		SkillID:  "git-commit",
		Name:     "git-commit",
		Source:   "cameronmcgear/git-commit",
		Installs: 1250,
	},
}

type SkillsHandler struct {
	auth       *AuthHelper
	db         *db.DB
	cacheMutex sync.RWMutex
	cachedList []SkillItem
	cacheTime  time.Time
	cacheCwd   string
}

func (h *SkillsHandler) invalidateCache() {
	h.cacheMutex.Lock()
	defer h.cacheMutex.Unlock()
	h.cacheTime = time.Time{}
	h.cachedList = nil
	h.cacheCwd = ""
}

func NewSkillsHandler(auth *AuthHelper, database *db.DB) *SkillsHandler {
	return &SkillsHandler{auth: auth, db: database}
}

// parseSkillFrontmatter extracts YAML frontmatter name and description from a SKILL.md file.
func parseSkillFrontmatter(content string) (name string, desc string, tags []string) {
	trimmed := strings.TrimSpace(content)
	if !strings.HasPrefix(trimmed, "---") {
		return "", "", nil
	}

	parts := strings.SplitN(trimmed, "---", 3)
	if len(parts) < 3 {
		return "", "", nil
	}

	fmContent := parts[1]
	scanner := bufio.NewScanner(strings.NewReader(fmContent))
	var inDesc bool
	var descLines []string

	for scanner.Scan() {
		line := scanner.Text()
		trimmedLine := strings.TrimSpace(line)

		if inDesc {
			if strings.HasPrefix(line, "  ") || strings.HasPrefix(line, "	") {
				descLines = append(descLines, strings.TrimSpace(line))
				continue
			}
			inDesc = false
		}

		if strings.HasPrefix(trimmedLine, "name:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmedLine, "name:"))
			name = strings.Trim(val, "\"'`")
		} else if strings.HasPrefix(trimmedLine, "description:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmedLine, "description:"))
			if val == ">-" || val == "|" || val == ">" || val == "" {
				inDesc = true
				descLines = nil
			} else {
				desc = strings.Trim(val, "\"'`")
			}
		}
	}

	if len(descLines) > 0 {
		desc = strings.Join(descLines, " ")
	}

	return name, desc, tags
}

// scanSkillsInDirectory inspects subdirectories inside a skills container directory.
func scanSkillsInDirectory(containerDir string, scope string) []SkillItem {
	var items []SkillItem

	entries, err := os.ReadDir(containerDir)
	if err != nil {
		return items
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillDir := filepath.Join(containerDir, entry.Name())
		skillFile := filepath.Join(skillDir, "SKILL.md")

		// Fallback check for lowercase skill.md
		if _, err := os.Stat(skillFile); os.IsNotExist(err) {
			lowercase := filepath.Join(skillDir, "skill.md")
			if _, err2 := os.Stat(lowercase); err2 == nil {
				skillFile = lowercase
			} else {
				continue
			}
		}

		contentBytes, err := os.ReadFile(skillFile)
		if err != nil {
			continue
		}

		content := string(contentBytes)
		parsedName, parsedDesc, parsedTags := parseSkillFrontmatter(content)
		if parsedName == "" {
			parsedName = entry.Name()
		}
		if parsedDesc == "" {
			parsedDesc = "Custom " + scope + " skill (" + parsedName + ")"
		}

		hasScripts := false
		if fi, err := os.Stat(filepath.Join(skillDir, "scripts")); err == nil && fi.IsDir() {
			hasScripts = true
		}

		hasResources := false
		if fi, err := os.Stat(filepath.Join(skillDir, "resources")); err == nil && fi.IsDir() {
			hasResources = true
		}

		items = append(items, SkillItem{
			Name:         parsedName,
			Description:  parsedDesc,
			Scope:        scope,
			Path:         skillDir,
			SkillFile:    skillFile,
			HasScripts:   hasScripts,
			HasResources: hasResources,
			Tags:         parsedTags,
		})
	}

	return items
}

// ListSkills handles GET /api/skills. Discovers workspace, global, and builtin skills.
func (h *SkillsHandler) ListSkills(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))
	home, _ := os.UserHomeDir()
	if home != "" {
		home = filepath.Clean(home)
	}

	if cwd == "" {
		cwd = home
	}
	cwd = filepath.Clean(cwd)

	isHome := persona.IsHomeDirectory(cwd)

	var allSkills []SkillItem

	h.cacheMutex.RLock()
	if time.Since(h.cacheTime) < 5*time.Second && h.cacheCwd == cwd && h.cachedList != nil {
		allSkills = make([]SkillItem, len(h.cachedList))
		copy(allSkills, h.cachedList)
		h.cacheMutex.RUnlock()
	} else {
		h.cacheMutex.RUnlock()

		seen := make(map[string]bool)

		// 1. Workspace Skills (highest priority)
		if !isHome && cwd != "" {
			workspaceDirs := []string{
				filepath.Join(cwd, ".agents", "skills"),
				filepath.Join(cwd, ".agent", "skills"),
				filepath.Join(cwd, ".claude", "skills"),
			}

			// Also check git root if cwd is subdirectory
			curr := cwd
			tempDir := filepath.Clean(os.TempDir())
			for {
				if curr == home || persona.IsHomeDirectory(curr) || curr == tempDir {
					break
				}
				gitDir := filepath.Join(curr, ".git")
				if fi, err := os.Stat(gitDir); err == nil && (fi.IsDir() || !fi.IsDir()) {
					workspaceDirs = append(workspaceDirs, filepath.Join(curr, ".agents", "skills"))
					break
				}
				parent := filepath.Dir(curr)
				if parent == curr || parent == "." || parent == "/" {
					break
				}
				curr = parent
			}

			for _, dir := range workspaceDirs {
				skills := scanSkillsInDirectory(dir, "workspace")
				for _, sk := range skills {
				if !seen[sk.Name] {
					seen[sk.Name] = true
					allSkills = append(allSkills, sk)
				}
			}
		}
		}

		// 2. Global Skills in User Home (~/.agents/skills)
		if home != "" {
			homeSkillsDir := filepath.Join(home, ".agents", "skills")
			skills := scanSkillsInDirectory(homeSkillsDir, "global")
			for _, sk := range skills {
				if !seen[sk.Name] {
					seen[sk.Name] = true
					allSkills = append(allSkills, sk)
				}
			}

			// Global plugin skills (e.g. ~/.gemini/config/plugins/*/skills)
			pluginsBase := filepath.Join(home, ".gemini", "config", "plugins")
			if pluginEntries, err := os.ReadDir(pluginsBase); err == nil {
				for _, pe := range pluginEntries {
					if pe.IsDir() {
						pluginSkillsDir := filepath.Join(pluginsBase, pe.Name(), "skills")
						pluginSkills := scanSkillsInDirectory(pluginSkillsDir, "global")
						for _, sk := range pluginSkills {
							if !seen[sk.Name] {
								seen[sk.Name] = true
								allSkills = append(allSkills, sk)
							}
						}
					}
				}
			}

			// 3. Builtin Skills (~/.gemini/antigravity-cli/builtin/skills)
			builtinDir := filepath.Join(home, ".gemini", "antigravity-cli", "builtin", "skills")
			builtinSkills := scanSkillsInDirectory(builtinDir, "builtin")
			for _, sk := range builtinSkills {
				if !seen[sk.Name] {
					seen[sk.Name] = true
					allSkills = append(allSkills, sk)
				}
			}
		}

		h.cacheMutex.Lock()
		h.cachedList = make([]SkillItem, len(allSkills))
		copy(h.cachedList, allSkills)
		h.cacheTime = time.Now()
		h.cacheCwd = cwd
		h.cacheMutex.Unlock()
	}

	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	qLower := strings.ToLower(q)

	var filteredSkills []SkillItem
	for _, sk := range allSkills {
		if scope != "" && scope != "all" && sk.Scope != scope {
			continue
		}
		if q != "" {
			nameMatch := strings.Contains(strings.ToLower(sk.Name), qLower)
			descMatch := strings.Contains(strings.ToLower(sk.Description), qLower)
			tagMatch := false
			for _, tag := range sk.Tags {
				if strings.Contains(strings.ToLower(tag), qLower) {
					tagMatch = true
					break
				}
			}
			if !nameMatch && !descMatch && !tagMatch {
				continue
			}
		}
		filteredSkills = append(filteredSkills, sk)
	}
	if filteredSkills == nil {
		filteredSkills = []SkillItem{}
	}

	pageStr := strings.TrimSpace(r.URL.Query().Get("page"))
	limitStr := strings.TrimSpace(r.URL.Query().Get("limit"))

	limit := 0
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	if limit <= 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SkillsResponse{
			WorkspacePath: cwd,
			IsHome:        isHome,
			Skills:        filteredSkills,
			Count:         len(filteredSkills),
			Total:         len(filteredSkills),
			Page:          1,
			Limit:         0,
			TotalPages:    1,
		})
		return
	}

	if limit > 100 {
		limit = 100
	}
	page := 1
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	total := len(filteredSkills)
	totalPages := 1
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	if page > totalPages && total > 0 {
		page = totalPages
	}

	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	sliced := filteredSkills[start:end]
	if sliced == nil {
		sliced = []SkillItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SkillsResponse{
		WorkspacePath: cwd,
		IsHome:        isHome,
		Skills:        sliced,
		Count:         len(sliced),
		Total:         total,
		Page:          page,
		Limit:         limit,
		TotalPages:    totalPages,
	})
}

// GetSkillContent handles GET /api/skills/content?path=<skillFilePath>.
func (h *SkillsHandler) GetSkillContent(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	filePath := strings.TrimSpace(r.URL.Query().Get("path"))
	if filePath == "" {
		http.Error(w, `{"error":"Missing path query parameter"}`, http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(filePath)
	base := filepath.Base(cleanPath)
	if strings.ToLower(base) != "skill.md" {
		http.Error(w, `{"error":"Invalid skill file: must be SKILL.md"}`, http.StatusBadRequest)
		return
	}

	contentBytes, err := os.ReadFile(cleanPath)
	if err != nil {
		http.Error(w, `{"error":"Skill file not found or inaccessible"}`, http.StatusNotFound)
		return
	}

	content := string(contentBytes)
	name, desc, _ := parseSkillFrontmatter(content)
	if name == "" {
		name = filepath.Base(filepath.Dir(cleanPath))
	}

	scope := "workspace"
	home, _ := os.UserHomeDir()
	if home != "" && strings.Contains(cleanPath, filepath.Join(home, ".gemini")) {
		if strings.Contains(cleanPath, "builtin") {
			scope = "builtin"
		} else {
			scope = "global"
		}
	} else if home != "" && strings.Contains(cleanPath, filepath.Join(home, ".agents")) {
		scope = "global"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SkillContentResponse{
		Name:        name,
		Description: desc,
		Content:     content,
		Path:        cleanPath,
		Scope:       scope,
	})
}

// ScaffoldSkill handles POST /api/skills/scaffold to initialize a new SKILL.md template.
func (h *SkillsHandler) ScaffoldSkill(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req ScaffoldSkillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || !validSkillNameRegex.MatchString(name) {
		http.Error(w, `{"error":"Invalid skill name: must be alphanumeric with hyphens or underscores"}`, http.StatusBadRequest)
		return
	}

	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		desc = "Custom skill for " + name
	}

	home, _ := os.UserHomeDir()
	var targetDir string

	if req.Scope == "global" {
		if home == "" {
			http.Error(w, `{"error":"Unable to locate user home directory for global skill"}`, http.StatusInternalServerError)
			return
		}
		targetDir = filepath.Join(home, ".agents", "skills", name)
	} else {
		cwd := strings.TrimSpace(req.Cwd)
		if cwd == "" {
			cwd = home
		}
		cwd = filepath.Clean(cwd)
		targetDir = filepath.Join(cwd, ".agents", "skills", name)
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		http.Error(w, `{"error":"Failed to create skill directory: ` + err.Error() + `"}`, http.StatusInternalServerError)
		return
	}

	skillFile := filepath.Join(targetDir, "SKILL.md")
	if _, err := os.Stat(skillFile); err == nil {
		http.Error(w, `{"error":"Skill ` + name + ` already exists"}`, http.StatusConflict)
		return
	}

	templateContent := strings.Join([]string{
		"---",
		"name: " + name,
		"description: " + desc,
		"---",
		"",
		"# " + strings.Title(strings.ReplaceAll(name, "-", " ")),
		"",
		"## Overview",
		desc,
		"",
		"## Instructions",
		"1. Step 1: Define initial requirements.",
		"2. Step 2: Run verification tests.",
		"",
	}, "\n")

	if err := os.WriteFile(skillFile, []byte(templateContent), 0644); err != nil {
		http.Error(w, `{"error":"Failed to write SKILL.md: ` + err.Error() + `"}`, http.StatusInternalServerError)
		return
	}

	h.invalidateCache()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(SkillItem{
		Name:         name,
		Description:  desc,
		Scope:        req.Scope,
		Path:         targetDir,
		SkillFile:    skillFile,
		HasScripts:   false,
		HasResources: false,
	})
}

func loadSkillLock(lockPath string) (*SkillLockFile, error) {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &SkillLockFile{
				Version: 1,
				Skills:  make(map[string]SkillLockEntry),
			}, nil
		}
		return nil, err
	}
	var lock SkillLockFile
	if err := json.Unmarshal(data, &lock); err != nil {
		return nil, err
	}
	if lock.Skills == nil {
		lock.Skills = make(map[string]SkillLockEntry)
	}
	if lock.Version == 0 {
		lock.Version = 1
	}
	return &lock, nil
}

func saveSkillLock(lockPath string, lock *SkillLockFile) error {
	if lock.Skills == nil {
		lock.Skills = make(map[string]SkillLockEntry)
	}
	if lock.Version == 0 {
		lock.Version = 1
	}
	data, err := json.MarshalIndent(lock, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	dir := filepath.Dir(lockPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmpFile := fmt.Sprintf("%s.tmp.%d", lockPath, time.Now().UnixNano())
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, lockPath)
}

func extractTarGz(r io.Reader, destDir string) error {
	gzr, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		parts := strings.Split(header.Name, "/")
		if len(parts) <= 1 {
			continue
		}
		relPath := strings.Join(parts[1:], "/")
		if relPath == "" {
			continue
		}

		target := filepath.Join(destDir, relPath)
		cleanTarget := filepath.Clean(target)
		cleanDest := filepath.Clean(destDir)
		if !strings.HasPrefix(cleanTarget, cleanDest) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(cleanTarget, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
				return err
			}
			f, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}
	return nil
}

func (h *SkillsHandler) installSkillFromSource(source, skillName, scope, cwd string) (*SkillItem, error) {
	source = strings.TrimSpace(source)
	skillName = strings.TrimSpace(skillName)
	scope = strings.TrimSpace(scope)
	if scope == "" {
		scope = "workspace"
	}

	home, _ := os.UserHomeDir()
	var targetParent string
	var lockPath string

	if scope == "global" {
		if home == "" {
			return nil, fmt.Errorf("unable to locate user home directory for global skill")
		}
		targetParent = filepath.Join(home, ".agents", "skills")
		lockPath = filepath.Join(home, "skills-lock.json")
	} else {
		if cwd == "" {
			cwd = home
		}
		cwd = filepath.Clean(cwd)
		targetParent = filepath.Join(cwd, ".agents", "skills")
		lockPath = filepath.Join(cwd, "skills-lock.json")
	}

	tmpDir, err := os.MkdirTemp("", "agy-skill-download-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	cleanSource := strings.TrimPrefix(source, "https://github.com/")
	cleanSource = strings.TrimPrefix(cleanSource, "http://github.com/")
	cleanSource = strings.TrimPrefix(cleanSource, "git@github.com:")
	cleanSource = strings.TrimSuffix(cleanSource, ".git")

	var repoOwner, repoName string
	var cloneURL string

	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "file://") || filepath.IsAbs(source) {
		cloneURL = source
		parts := strings.Split(strings.TrimRight(cleanSource, "/"), "/")
		if len(parts) > 0 {
			repoName = parts[len(parts)-1]
		}
	} else {
		parts := strings.Split(cleanSource, "/")
		if len(parts) >= 2 {
			repoOwner = parts[0]
			repoName = parts[1]
			cloneURL = fmt.Sprintf("https://github.com/%s/%s.git", repoOwner, repoName)
			if skillName == "" && len(parts) >= 3 {
				skillName = parts[2]
			}
		} else {
			repoName = cleanSource
			cloneURL = fmt.Sprintf("https://github.com/%s.git", cleanSource)
		}
	}

	cloneSucceeded := false

	// If source is a local directory, copy directly or clone
	if fi, err := os.Stat(source); err == nil && fi.IsDir() {
		copyErr := filepath.Walk(source, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(source, p)
			if err != nil || rel == "." {
				return nil
			}
			dest := filepath.Join(tmpDir, rel)
			if info.IsDir() {
				return os.MkdirAll(dest, 0755)
			}
			content, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			return os.WriteFile(dest, content, 0644)
		})
		if copyErr == nil {
			cloneSucceeded = true
		}
	}

	// 1. Try git clone
	if !cloneSucceeded {
		if gitPath, err := exec.LookPath("git"); err == nil && gitPath != "" {
			cmd := exec.Command(gitPath, "clone", "--depth", "1", cloneURL, tmpDir)
			if err := cmd.Run(); err == nil {
				cloneSucceeded = true
			}
		}
	}

	// 2. Tarball fallback
	if !cloneSucceeded && repoOwner != "" && repoName != "" {
		tarURLs := []string{
			fmt.Sprintf("https://codeload.github.com/%s/%s/tar.gz/refs/heads/main", repoOwner, repoName),
			fmt.Sprintf("https://codeload.github.com/%s/%s/tar.gz/refs/heads/master", repoOwner, repoName),
		}
		client := &http.Client{Timeout: 30 * time.Second}
		for _, tarURL := range tarURLs {
			resp, err := client.Get(tarURL)
			if err == nil && resp.StatusCode == http.StatusOK {
				if err := extractTarGz(resp.Body, tmpDir); err == nil {
					cloneSucceeded = true
					resp.Body.Close()
					break
				}
				resp.Body.Close()
			} else if resp != nil {
				resp.Body.Close()
			}
		}
	}

	if !cloneSucceeded {
		return nil, fmt.Errorf("failed to download skill from %s (git clone and tarball fallback failed)", source)
	}

	// Locate SKILL.md
	checkSkillFile := func(dir string) (string, bool) {
		f1 := filepath.Join(dir, "SKILL.md")
		if fi, err := os.Stat(f1); err == nil && !fi.IsDir() {
			return f1, true
		}
		f2 := filepath.Join(dir, "skill.md")
		if fi, err := os.Stat(f2); err == nil && !fi.IsDir() {
			return f2, true
		}
		return "", false
	}

	var foundDir string
	if skillName != "" {
		candidates := []string{
			filepath.Join(tmpDir, skillName),
			filepath.Join(tmpDir, "skills", skillName),
			filepath.Join(tmpDir, ".agents", "skills", skillName),
		}
		for _, c := range candidates {
			if _, ok := checkSkillFile(c); ok {
				foundDir = c
				break
			}
		}

		if foundDir == "" {
			filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
				if err != nil || foundDir != "" {
					return nil
				}
				if info.IsDir() && info.Name() == skillName {
					if _, ok := checkSkillFile(path); ok {
						foundDir = path
						return nil
					}
				}
				if !info.IsDir() && (info.Name() == "SKILL.md" || info.Name() == "skill.md") {
					dir := filepath.Dir(path)
					data, err := os.ReadFile(path)
					if err == nil {
						fmName, _, _ := parseSkillFrontmatter(string(data))
						if fmName == skillName {
							foundDir = dir
							return nil
						}
					}
				}
				return nil
			})
		}

		if foundDir == "" {
			if _, ok := checkSkillFile(tmpDir); ok {
				foundDir = tmpDir
			}
		}
	} else {
		if _, ok := checkSkillFile(tmpDir); ok {
			foundDir = tmpDir
		} else {
			skillsSub := filepath.Join(tmpDir, "skills")
			if entries, err := os.ReadDir(skillsSub); err == nil {
				for _, e := range entries {
					if e.IsDir() {
						sub := filepath.Join(skillsSub, e.Name())
						if _, ok := checkSkillFile(sub); ok {
							foundDir = sub
							skillName = e.Name()
							break
						}
					}
				}
			}
			if foundDir == "" {
				filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
					if err != nil || foundDir != "" {
						return nil
					}
					if !info.IsDir() && (info.Name() == "SKILL.md" || info.Name() == "skill.md") {
						dir := filepath.Dir(path)
						if filepath.Base(dir) != ".git" {
							foundDir = dir
							skillName = filepath.Base(dir)
							return nil
						}
					}
					return nil
				})
			}
		}
	}

	if foundDir == "" {
		return nil, fmt.Errorf("no SKILL.md found in %s", source)
	}

	srcSkillFile, ok := checkSkillFile(foundDir)
	if !ok {
		return nil, fmt.Errorf("no SKILL.md in directory %s", foundDir)
	}

	skillContentBytes, err := os.ReadFile(srcSkillFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read skill file: %w", err)
	}
	fmName, fmDesc, fmTags := parseSkillFrontmatter(string(skillContentBytes))
	if skillName == "" {
		if fmName != "" {
			skillName = fmName
		} else if repoName != "" {
			skillName = repoName
		} else {
			skillName = filepath.Base(foundDir)
		}
	}
	if fmDesc == "" {
		fmDesc = "Custom " + scope + " skill (" + skillName + ")"
	}

	targetDir := filepath.Join(targetParent, skillName)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create target skill directory: %w", err)
	}

	err = filepath.Walk(foundDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(foundDir, path)
		if err != nil || rel == "." {
			return nil
		}
		if strings.HasPrefix(rel, ".git") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		destPath := filepath.Join(targetDir, rel)
		if info.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		if strings.ToLower(info.Name()) == "skill.md" {
			destPath = filepath.Join(filepath.Dir(destPath), "SKILL.md")
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, content, 0644)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to copy skill files: %w", err)
	}

	destSkillFile := filepath.Join(targetDir, "SKILL.md")
	destBytes, err := os.ReadFile(destSkillFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read destination SKILL.md: %w", err)
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(destBytes))

	// Update skills-lock.json
	lock, err := loadSkillLock(lockPath)
	if err != nil {
		lock = &SkillLockFile{Version: 1, Skills: make(map[string]SkillLockEntry)}
	}
	lock.Skills[skillName] = SkillLockEntry{
		Source:       source,
		SourceType:   "github",
		SkillPath:    fmt.Sprintf("skills/%s/SKILL.md", skillName),
		ComputedHash: hash,
	}
	_ = saveSkillLock(lockPath, lock)

	hasScripts := false
	if fi, err := os.Stat(filepath.Join(targetDir, "scripts")); err == nil && fi.IsDir() {
		hasScripts = true
	}
	hasResources := false
	if fi, err := os.Stat(filepath.Join(targetDir, "resources")); err == nil && fi.IsDir() {
		hasResources = true
	}

	return &SkillItem{
		Name:         skillName,
		Description:  fmDesc,
		Scope:        scope,
		Path:         targetDir,
		SkillFile:    destSkillFile,
		HasScripts:   hasScripts,
		HasResources: hasResources,
		Tags:         fmTags,
	}, nil
}

// SearchSkills handles GET /api/skills/search?q=<query>&limit=<limit>&page=<page>.
func (h *SkillsHandler) SearchSkills(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limitStr := strings.TrimSpace(r.URL.Query().Get("limit"))
	pageStr := strings.TrimSpace(r.URL.Query().Get("page"))

	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}

	page := 1
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	qParam := q
	if qParam == "" {
		qParam = "agent"
	}

	baseURL := os.Getenv("SKILLS_SH_SEARCH_URL")
	if baseURL == "" {
		baseURL = "https://skills.sh/api/search"
	}

	reqURL := fmt.Sprintf("%s?q=%s&limit=100", baseURL, url.QueryEscape(qParam))

	var remoteSkills []RemoteSkillItem
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(reqURL)
	if err == nil && resp.StatusCode == http.StatusOK {
		var res struct {
			Query  string            `json:"query"`
			Skills []RemoteSkillItem `json:"skills"`
			Count  int               `json:"count"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err == nil && len(res.Skills) > 0 {
			remoteSkills = res.Skills
		}
		resp.Body.Close()
	} else if resp != nil {
		resp.Body.Close()
	}

	if len(remoteSkills) == 0 {
		qLower := strings.ToLower(q)
		for _, item := range curatedPopularSkills {
			if qLower == "" || qLower == "agent" || strings.Contains(strings.ToLower(item.Name), qLower) || strings.Contains(strings.ToLower(item.Source), qLower) {
				remoteSkills = append(remoteSkills, item)
			}
		}
	}

	total := len(remoteSkills)
	totalPages := 1
	if total > 0 {
		totalPages = (total + limit - 1) / limit
	}
	if page > totalPages && total > 0 {
		page = totalPages
	}

	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	sliced := remoteSkills[start:end]
	if sliced == nil {
		sliced = []RemoteSkillItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SkillsSearchResponse{
		Query:      q,
		Skills:     sliced,
		Count:      len(sliced),
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	})
}

// InstallSkill handles POST /api/skills/install.
func (h *SkillsHandler) InstallSkill(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req InstallSkillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		http.Error(w, `{"error":"Missing skill source"}`, http.StatusBadRequest)
		return
	}

	skillName := strings.TrimSpace(req.SkillName)
	if skillName != "" && !validSkillNameRegex.MatchString(skillName) {
		http.Error(w, `{"error":"Invalid skill name"}`, http.StatusBadRequest)
		return
	}

	installed, err := h.installSkillFromSource(source, skillName, req.Scope, req.Cwd)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	h.invalidateCache()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(installed)
}

// ConvertHermesPlugin handles POST /api/skills/convert-hermes.
func (h *SkillsHandler) ConvertHermesPlugin(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req ConvertHermesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	source := strings.TrimSpace(req.Source)
	if source == "" {
		http.Error(w, `{"error":"Missing plugin source"}`, http.StatusBadRequest)
		return
	}

	// Reject dangerous shell metacharacters in source
	if strings.ContainsAny(source, ";|&$`><\n\r") {
		http.Error(w, `{"error":"Source contains invalid characters"}`, http.StatusBadRequest)
		return
	}

	scope := strings.TrimSpace(req.Scope)
	if scope == "" {
		scope = "workspace"
	}

	home, _ := os.UserHomeDir()
	var targetParent string
	var lockPath string

	if scope == "global" {
		if home == "" {
			http.Error(w, `{"error":"Unable to locate user home directory for global skill"}`, http.StatusInternalServerError)
			return
		}
		targetParent = filepath.Join(home, ".agents", "skills")
		lockPath = filepath.Join(home, "skills-lock.json")
	} else {
		cwd := strings.TrimSpace(req.Cwd)
		if cwd == "" {
			cwd = home
		}
		cwd = filepath.Clean(cwd)
		targetParent = filepath.Join(cwd, ".agents", "skills")
		lockPath = filepath.Join(cwd, "skills-lock.json")
	}

	// Resolve temporary working folder
	tmpDir, err := os.MkdirTemp("", "hermes-convert-*")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to create temp directory: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tmpDir)

	var pluginDir string

	// Check if source is a local folder
	isLocal := false
	if fi, err := os.Stat(source); err == nil && fi.IsDir() {
		isLocal = true
		pluginDir = source
	} else {
		// If not absolute local dir, check if relative to cwd
		cwd := strings.TrimSpace(req.Cwd)
		if cwd != "" {
			cand := filepath.Join(cwd, source)
			if fi, err := os.Stat(cand); err == nil && fi.IsDir() {
				isLocal = true
				pluginDir = cand
			}
		}
	}

	if !isLocal {
		cleanSource := strings.TrimPrefix(source, "https://github.com/")
		cleanSource = strings.TrimPrefix(cleanSource, "http://github.com/")
		cleanSource = strings.TrimPrefix(cleanSource, "git@github.com:")
		cleanSource = strings.TrimSuffix(cleanSource, ".git")

		var repoOwner, repoName string
		var cloneURL string

		if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "file://") {
			cloneURL = source
			parts := strings.Split(strings.TrimRight(cleanSource, "/"), "/")
			if len(parts) > 0 {
				repoName = parts[len(parts)-1]
			}
		} else {
			parts := strings.Split(cleanSource, "/")
			if len(parts) >= 2 {
				repoOwner = parts[0]
				repoName = parts[1]
				cloneURL = fmt.Sprintf("https://github.com/%s/%s.git", repoOwner, repoName)
			} else {
				repoName = cleanSource
				cloneURL = fmt.Sprintf("https://github.com/%s.git", cleanSource)
			}
		}

		cloneSucceeded := false
		if gitPath, err := exec.LookPath("git"); err == nil && gitPath != "" {
			cmd := exec.Command(gitPath, "clone", "--depth", "1", cloneURL, tmpDir)
			if err := cmd.Run(); err == nil {
				cloneSucceeded = true
			}
		}

		if !cloneSucceeded && repoOwner != "" && repoName != "" {
			tarURLs := []string{
				fmt.Sprintf("https://codeload.github.com/%s/%s/tar.gz/refs/heads/main", repoOwner, repoName),
				fmt.Sprintf("https://codeload.github.com/%s/%s/tar.gz/refs/heads/master", repoOwner, repoName),
			}
			client := &http.Client{Timeout: 30 * time.Second}
			for _, tarURL := range tarURLs {
				resp, err := client.Get(tarURL)
				if err == nil && resp.StatusCode == http.StatusOK {
					if err := extractTarGz(resp.Body, tmpDir); err == nil {
						cloneSucceeded = true
						resp.Body.Close()
						break
					}
					resp.Body.Close()
				} else if resp != nil {
					resp.Body.Close()
				}
			}
		}

		if !cloneSucceeded {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to download Hermes plugin from %s"}`, source), http.StatusBadRequest)
			return
		}

		pluginDir = tmpDir
	}

	// Verify Hermes plugin exists in pluginDir or subdirectory
	if !DetectHermesPlugin(pluginDir) {
		http.Error(w, `{"error":"Not a valid Hermes plugin: missing plugin.yaml or tools.py"}`, http.StatusBadRequest)
		return
	}

	actualPluginDir := FindHermesPluginDir(pluginDir)

	// Parse manifest
	var meta HermesPluginMetadata
	var manifestPath string
	for _, m := range []string{"plugin.yaml", "plugin.yml"} {
		p := filepath.Join(actualPluginDir, m)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			manifestPath = p
			break
		}
	}

	if manifestPath != "" {
		mName, mVersion, mDesc, reqEnv, optEnv, err := ParseHermesManifest(manifestPath)
		if err == nil {
			meta.Name = mName
			meta.Version = mVersion
			meta.Description = mDesc
			meta.RequiresEnv = reqEnv
			meta.OptionalEnv = optEnv
		}
	}

	// Extract tools
	toolsPyPath := filepath.Join(actualPluginDir, "tools.py")
	schemasPyPath := filepath.Join(actualPluginDir, "schemas.py")
	tools, _ := ExtractPythonTools(toolsPyPath, schemasPyPath)
	meta.Tools = tools

	// Determine skill name
	skillName := strings.TrimSpace(req.CustomName)
	if skillName == "" {
		skillName = meta.Name
	}
	if skillName == "" {
		parts := strings.Split(strings.TrimRight(source, "/"), "/")
		if len(parts) > 0 {
			skillName = strings.TrimSuffix(parts[len(parts)-1], ".git")
		}
	}
	// Sanitize skillName
	skillName = strings.ToLower(skillName)
	skillName = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(skillName, "-")
	skillName = strings.Trim(skillName, "-_")
	if skillName == "" {
		skillName = "hermes-skill"
	}
	meta.Name = skillName

	targetDir := filepath.Join(targetParent, skillName)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to create skill target directory: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Execute conversion
	if err := ConvertHermesDirectory(actualPluginDir, targetDir, skillName, meta); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to convert Hermes plugin: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Compute hash of SKILL.md for lockfile
	skillFile := filepath.Join(targetDir, "SKILL.md")
	contentBytes, _ := os.ReadFile(skillFile)
	hasher := sha256.New()
	hasher.Write(contentBytes)
	hashStr := fmt.Sprintf("%x", hasher.Sum(nil))

	// Update skills-lock.json
	lock, err := loadSkillLock(lockPath)
	if err != nil || lock == nil {
		lock = &SkillLockFile{Version: 1, Skills: make(map[string]SkillLockEntry)}
	}
	lock.Skills[skillName] = SkillLockEntry{
		Source:       source,
		SourceType:   "hermes-plugin",
		SkillPath:    "SKILL.md",
		ComputedHash: hashStr,
	}
	_ = saveSkillLock(lockPath, lock)

	respItem := SkillItem{
		Name:         skillName,
		Description:  meta.Description,
		Scope:        scope,
		Path:         targetDir,
		SkillFile:    skillFile,
		HasScripts:   true,
		HasResources: false,
		Tags:         []string{"hermes-plugin"},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(respItem)
}

// DeleteSkill handles DELETE /api/skills?name=<name>&scope=<scope>&cwd=<cwd>.
func (h *SkillsHandler) DeleteSkill(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	name := strings.TrimSpace(r.URL.Query().Get("name"))
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))

	if name == "" || !validSkillNameRegex.MatchString(name) {
		http.Error(w, `{"error":"Invalid skill name"}`, http.StatusBadRequest)
		return
	}

	home, _ := os.UserHomeDir()
	if cwd == "" {
		cwd = home
	}
	cwd = filepath.Clean(cwd)

	var targetParent string
	var lockPath string
	if scope == "global" {
		if home == "" {
			http.Error(w, `{"error":"Unable to locate home directory"}`, http.StatusInternalServerError)
			return
		}
		targetParent = filepath.Join(home, ".agents", "skills")
		lockPath = filepath.Join(home, "skills-lock.json")
	} else if scope == "builtin" {
		http.Error(w, `{"error":"Builtin skills cannot be deleted"}`, http.StatusForbidden)
		return
	} else {
		targetParent = filepath.Join(cwd, ".agents", "skills")
		lockPath = filepath.Join(cwd, "skills-lock.json")
	}

	targetDir := filepath.Join(targetParent, name)
	cleanTarget := filepath.Clean(targetDir)
	cleanParent := filepath.Clean(targetParent)

	// Guard against path traversal
	if filepath.Dir(cleanTarget) != cleanParent {
		http.Error(w, `{"error":"Invalid skill path"}`, http.StatusBadRequest)
		return
	}

	// Guard against deleting builtin
	if strings.Contains(cleanTarget, "builtin") {
		http.Error(w, `{"error":"Builtin skills cannot be deleted"}`, http.StatusForbidden)
		return
	}

	if err := os.RemoveAll(cleanTarget); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to remove skill directory: %v"}`, err), http.StatusInternalServerError)
		return
	}

	h.invalidateCache()

	// Remove from skills-lock.json if present
	if lock, err := loadSkillLock(lockPath); err == nil {
		if _, exists := lock.Skills[name]; exists {
			delete(lock.Skills, name)
			_ = saveSkillLock(lockPath, lock)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"ok":   true,
		"name": name,
	})
}

// SyncSkills handles POST /api/skills/sync.
func (h *SkillsHandler) SyncSkills(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	cwd := strings.TrimSpace(r.URL.Query().Get("cwd"))
	if r.Body != nil {
		var req struct {
			Cwd string `json:"cwd"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil && req.Cwd != "" {
			cwd = req.Cwd
		}
	}

	home, _ := os.UserHomeDir()
	if cwd == "" {
		cwd = home
	}
	cwd = filepath.Clean(cwd)

	lockPath := filepath.Join(cwd, "skills-lock.json")
	lock, err := loadSkillLock(lockPath)
	if err != nil || len(lock.Skills) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SyncSkillsResponse{
			Synced:   0,
			Restored: []string{},
		})
		return
	}

	var restored []string
	var errs []string
	synced := 0

	for skillName, entry := range lock.Skills {
		synced++
		skillDir := filepath.Join(cwd, ".agents", "skills", skillName)
		skillFile := filepath.Join(skillDir, "SKILL.md")
		skillFileLower := filepath.Join(skillDir, "skill.md")

		missing := false
		if _, err := os.Stat(skillFile); os.IsNotExist(err) {
			if _, err2 := os.Stat(skillFileLower); os.IsNotExist(err2) {
				missing = true
			}
		}

		if missing {
			_, err := h.installSkillFromSource(entry.Source, skillName, "workspace", cwd)
			if err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", skillName, err))
			} else {
				restored = append(restored, skillName)
			}
		}
	}

	h.invalidateCache()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SyncSkillsResponse{
		Synced:   synced,
		Restored: restored,
		Errors:   errs,
	})
}
