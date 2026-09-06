package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var validPluginNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-\.]+$`)

func isValidPluginName(name string) bool {
	if name == "" || name == "." || name == ".." || len(name) > 100 {
		return false
	}
	return validPluginNameRegex.MatchString(name)
}

type PluginItem struct {
	Name        string   `json:"name"`
	Version     string   `json:"version,omitempty"`
	Description string   `json:"description,omitempty"`
	Author      string   `json:"author,omitempty"`
	Source      string   `json:"source"`
	ImportedAt  string   `json:"importedAt,omitempty"`
	Components  []string `json:"components"`
	Enabled     bool     `json:"enabled"`
	Path        string   `json:"path"`
	HasSkills   bool     `json:"hasSkills"`
	HasCommands bool     `json:"hasCommands"`
	SkillsCount int      `json:"skillsCount"`
}

type PluginsResponse struct {
	Plugins []PluginItem `json:"plugins"`
	Count   int          `json:"count"`
}

type InstallPluginRequest struct {
	Target string `json:"target"`
}

type UninstallPluginRequest struct {
	Name string `json:"name"`
}

type TogglePluginRequest struct {
	Name   string `json:"name"`
	Enable bool   `json:"enable"`
}

type PluginsHandler struct {
	auth *AuthHelper
}

func NewPluginsHandler(auth *AuthHelper) *PluginsHandler {
	return &PluginsHandler{auth: auth}
}

type rawImportManifest struct {
	Imports []struct {
		Name       string   `json:"name"`
		Source     string   `json:"source"`
		ImportedAt string   `json:"importedAt"`
		Components []string `json:"components"`
		Disabled   *bool    `json:"disabled,omitempty"`
		Enabled    *bool    `json:"enabled,omitempty"`
	} `json:"imports"`
}

type rawPluginMeta struct {
	Name        string          `json:"name"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	Author      json.RawMessage `json:"author"`
	Commands    string          `json:"commands"`
	Skills      string          `json:"skills"`
}

func parseAuthor(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		return str
	}
	var obj struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && obj.Name != "" {
		return obj.Name
	}
	return ""
}

func inspectPluginDirectory(pluginDir string) (meta rawPluginMeta, skillsCount int, hasCommands bool) {
	manifestPath := filepath.Join(pluginDir, "plugin.json")
	if bytes, err := os.ReadFile(manifestPath); err == nil {
		_ = json.Unmarshal(bytes, &meta)
	}

	// Determine skills directory
	skillsRel := meta.Skills
	if skillsRel == "" {
		skillsRel = "skills"
	}
	skillsPath := filepath.Clean(filepath.Join(pluginDir, skillsRel))
	if entries, err := os.ReadDir(skillsPath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				skillMD := filepath.Join(skillsPath, entry.Name(), "SKILL.md")
				skillMDLower := filepath.Join(skillsPath, entry.Name(), "skill.md")
				if _, err := os.Stat(skillMD); err == nil {
					skillsCount++
				} else if _, err := os.Stat(skillMDLower); err == nil {
					skillsCount++
				}
			}
		}
	}

	// Determine commands directory
	commandsRel := meta.Commands
	if commandsRel == "" {
		commandsRel = "commands"
	}
	commandsPath := filepath.Clean(filepath.Join(pluginDir, commandsRel))
	if entries, err := os.ReadDir(commandsPath); err == nil && len(entries) > 0 {
		hasCommands = true
	}

	return meta, skillsCount, hasCommands
}

// scanInstalledPlugins discovers all plugins from import_manifest.json and plugins directory.
func scanInstalledPlugins() []PluginItem {
	var results []PluginItem
	seen := make(map[string]bool)

	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return results
	}

	configDir := filepath.Join(home, ".gemini", "config")
	manifestPath := filepath.Join(configDir, "import_manifest.json")
	pluginsBaseDir := filepath.Join(configDir, "plugins")

	// 1. Read import_manifest.json
	if data, err := os.ReadFile(manifestPath); err == nil {
		var manifest rawImportManifest
		if err := json.Unmarshal(data, &manifest); err == nil {
			for _, imp := range manifest.Imports {
				if imp.Name == "" {
					continue
				}
				seen[imp.Name] = true

				enabled := true
				if imp.Disabled != nil && *imp.Disabled {
					enabled = false
				} else if imp.Enabled != nil {
					enabled = *imp.Enabled
				}

				pluginDir := filepath.Join(pluginsBaseDir, imp.Name)
				meta, skillsCount, hasCommands := inspectPluginDirectory(pluginDir)

				version := meta.Version
				desc := meta.Description
				author := parseAuthor(meta.Author)

				hasSkills := skillsCount > 0 || len(imp.Components) > 0 && containsString(imp.Components, "skills")
				if !hasCommands && containsString(imp.Components, "commands") {
					hasCommands = true
				}

				components := imp.Components
				if len(components) == 0 {
					if hasSkills {
						components = append(components, "skills")
					}
					if hasCommands {
						components = append(components, "commands")
					}
				}

				results = append(results, PluginItem{
					Name:        imp.Name,
					Version:     version,
					Description: desc,
					Author:      author,
					Source:      imp.Source,
					ImportedAt:  imp.ImportedAt,
					Components:  components,
					Enabled:     enabled,
					Path:        pluginDir,
					HasSkills:   hasSkills,
					HasCommands: hasCommands,
					SkillsCount: skillsCount,
				})
			}
		}
	}

	// 2. Scan pluginsBaseDir for any unmanifested plugins
	if entries, err := os.ReadDir(pluginsBaseDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() || seen[entry.Name()] {
				continue
			}
			pluginDir := filepath.Join(pluginsBaseDir, entry.Name())
			meta, skillsCount, hasCommands := inspectPluginDirectory(pluginDir)
			if meta.Name == "" {
				meta.Name = entry.Name()
			}

			var components []string
			if skillsCount > 0 {
				components = append(components, "skills")
			}
			if hasCommands {
				components = append(components, "commands")
			}

			results = append(results, PluginItem{
				Name:        entry.Name(),
				Version:     meta.Version,
				Description: meta.Description,
				Author:      parseAuthor(meta.Author),
				Source:      "local",
				Components:  components,
				Enabled:     true,
				Path:        pluginDir,
				HasSkills:   skillsCount > 0,
				HasCommands: hasCommands,
				SkillsCount: skillsCount,
			})
		}
	}

	return results
}

func containsString(slice []string, val string) bool {
	for _, item := range slice {
		if strings.EqualFold(item, val) {
			return true
		}
	}
	return false
}

// ListPlugins handles GET /api/plugins.
func (h *PluginsHandler) ListPlugins(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	plugins := scanInstalledPlugins()
	resp := PluginsResponse{
		Plugins: plugins,
		Count:   len(plugins),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// GetPlugin handles GET /api/plugins/{name}.
func (h *PluginsHandler) GetPlugin(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	name := r.PathValue("name")
	if !isValidPluginName(name) {
		http.Error(w, `{"error":"Invalid plugin name"}`, http.StatusBadRequest)
		return
	}

	plugins := scanInstalledPlugins()
	for _, p := range plugins {
		if p.Name == name {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(p)
			return
		}
	}

	http.Error(w, `{"error":"Plugin not found"}`, http.StatusNotFound)
}

// InstallPlugin handles POST /api/plugins/install.
func (h *PluginsHandler) InstallPlugin(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req InstallPluginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Target) == "" {
		http.Error(w, `{"error":"Target is required"}`, http.StatusBadRequest)
		return
	}

	target := strings.TrimSpace(req.Target)
	if strings.HasPrefix(target, "-") || len(target) > 255 {
		http.Error(w, `{"error":"Invalid plugin target"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "agy", "plugin", "install", target)
	out, err := cmd.CombinedOutput()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":      false,
			"error":   fmt.Sprintf("Failed to install plugin: %v", err),
			"output":  string(out),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":      true,
		"message": "Plugin installed successfully",
		"output":  string(out),
	})
}

// UninstallPlugin handles POST /api/plugins/uninstall.
func (h *PluginsHandler) UninstallPlugin(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req UninstallPluginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !isValidPluginName(req.Name) {
		http.Error(w, `{"error":"Valid plugin name is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "agy", "plugin", "uninstall", req.Name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":      false,
			"error":   fmt.Sprintf("Failed to uninstall plugin: %v", err),
			"output":  string(out),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":      true,
		"message": "Plugin uninstalled successfully",
		"output":  string(out),
	})
}

// TogglePlugin handles POST /api/plugins/toggle.
func (h *PluginsHandler) TogglePlugin(w http.ResponseWriter, r *http.Request) {
	if !h.auth.CheckAuth(r) {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req TogglePluginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !isValidPluginName(req.Name) {
		http.Error(w, `{"error":"Valid plugin name is required"}`, http.StatusBadRequest)
		return
	}

	subcmd := "enable"
	if !req.Enable {
		subcmd = "disable"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "agy", "plugin", subcmd, req.Name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":      false,
			"error":   fmt.Sprintf("Failed to %s plugin: %v", subcmd, err),
			"output":  string(out),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":      true,
		"message": fmt.Sprintf("Plugin %s %sd successfully", req.Name, subcmd),
		"output":  string(out),
	})
}
