package routes

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/huacheng/ai-cli-online/internal/db"
	"github.com/huacheng/ai-cli-online/internal/persona"
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

type SkillsHandler struct {
	auth *AuthHelper
	db   *db.DB
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
			if strings.HasPrefix(line, "  ") || strings.HasPrefix(line, "\t") {
				descLines = append(descLines, strings.TrimSpace(line))
				continue
			}
			inDesc = false
		}

		if strings.HasPrefix(trimmedLine, "name:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmedLine, "name:"))
			name = strings.Trim(val, `"'`)
		} else if strings.HasPrefix(trimmedLine, "description:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmedLine, "description:"))
			if val == ">-" || val == "|" || val == ">" || val == "" {
				inDesc = true
				descLines = nil
			} else {
				desc = strings.Trim(val, `"'`)
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
		for {
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SkillsResponse{
		WorkspacePath: cwd,
		IsHome:        isHome,
		Skills:        allSkills,
		Count:         len(allSkills),
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

var validSkillNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

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
		http.Error(w, `{"error":"Failed to create skill directory: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	skillFile := filepath.Join(targetDir, "SKILL.md")
	if _, err := os.Stat(skillFile); err == nil {
		http.Error(w, `{"error":"Skill `+name+` already exists"}`, http.StatusConflict)
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
		http.Error(w, `{"error":"Failed to write SKILL.md: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

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
