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

func TestParseSkillFrontmatter(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		wantName string
		wantDesc string
	}{
		{
			name: "Standard frontmatter",
			content: `---
name: my-skill
description: A helpful skill for automated tasks
---
# Instructions
Do something.`,
			wantName: "my-skill",
			wantDesc: "A helpful skill for automated tasks",
		},
		{
			name: "Folded multiline description",
			content: `---
name: multiline-skill
description: >-
  This is a multiline
  folded description that spans
  several lines.
---
# Body`,
			wantName: "multiline-skill",
			wantDesc: "This is a multiline folded description that spans several lines.",
		},
		{
			name: "Quoted values",
			content: `---
name: "quoted-skill"
description: 'Single quoted description'
---`,
			wantName: "quoted-skill",
			wantDesc: "Single quoted description",
		},
		{
			name:     "No frontmatter",
			content:  `# Just markdown\nNo yaml here`,
			wantName: "",
			wantDesc: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotName, gotDesc, _ := parseSkillFrontmatter(tt.content)
			if gotName != tt.wantName {
				t.Errorf("gotName = %q, want %q", gotName, tt.wantName)
			}
			if gotDesc != tt.wantDesc {
				t.Errorf("gotDesc = %q, want %q", gotDesc, tt.wantDesc)
			}
		})
	}
}

func TestSkillsHandler_ListAndContent(t *testing.T) {
	tmpHome, err := os.MkdirTemp("", "fake-home-skills-*")
	if err != nil {
		t.Fatalf("failed to create temp home: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	oldHome := os.Getenv("HOME")
	oldUserProfile := os.Getenv("USERPROFILE")
	defer func() {
		os.Setenv("HOME", oldHome)
		os.Setenv("USERPROFILE", oldUserProfile)
	}()
	os.Setenv("HOME", tmpHome)
	os.Setenv("USERPROFILE", tmpHome)

	tmpWorkspace, err := os.MkdirTemp("", "fake-ws-skills-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	// Create .git in workspace to establish repository root
	if err := os.MkdirAll(filepath.Join(tmpWorkspace, ".git"), 0755); err != nil {
		t.Fatalf("failed to create fake .git dir: %v", err)
	}

	// 1. Create a workspace skill
	wsSkillDir := filepath.Join(tmpWorkspace, ".agents", "skills", "deploy-staging")
	if err := os.MkdirAll(wsSkillDir, 0755); err != nil {
		t.Fatalf("failed to create ws skill dir: %v", err)
	}
	wsSkillContent := `---
name: deploy-staging
description: Deploy current branch to staging environment
---
# Staging runbook`
	if err := os.WriteFile(filepath.Join(wsSkillDir, "SKILL.md"), []byte(wsSkillContent), 0644); err != nil {
		t.Fatalf("failed to write ws skill: %v", err)
	}

	// 2. Create a global plugin skill
	globalSkillDir := filepath.Join(tmpHome, ".gemini", "config", "plugins", "ai-cli-task", "skills", "verify")
	if err := os.MkdirAll(globalSkillDir, 0755); err != nil {
		t.Fatalf("failed to create global skill dir: %v", err)
	}
	globalSkillContent := `---
name: verify
description: Run verification suite
---
# Verify steps`
	if err := os.WriteFile(filepath.Join(globalSkillDir, "SKILL.md"), []byte(globalSkillContent), 0644); err != nil {
		t.Fatalf("failed to write global skill: %v", err)
	}

	// 3. Create a builtin skill
	builtinSkillDir := filepath.Join(tmpHome, ".gemini", "antigravity-cli", "builtin", "skills", "antigravity-guide")
	if err := os.MkdirAll(builtinSkillDir, 0755); err != nil {
		t.Fatalf("failed to create builtin skill dir: %v", err)
	}
	builtinSkillContent := `---
name: antigravity-guide
description: AGY guide and quick reference
---
# AGY Guide`
	if err := os.WriteFile(filepath.Join(builtinSkillDir, "SKILL.md"), []byte(builtinSkillContent), 0644); err != nil {
		t.Fatalf("failed to write builtin skill: %v", err)
	}

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	// Unauthorized test
	reqUnauth := httptest.NewRequest("GET", "/api/skills", nil)
	wUnauth := httptest.NewRecorder()
	handler.ListSkills(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", wUnauth.Code)
	}

	// List skills test
	reqList := httptest.NewRequest("GET", "/api/skills?cwd="+tmpWorkspace, nil)
	reqList.Header.Set("Authorization", "Bearer skill-token")
	wList := httptest.NewRecorder()
	handler.ListSkills(wList, reqList)

	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", wList.Code, wList.Body.String())
	}

	var listRes SkillsResponse
	if err := json.NewDecoder(wList.Body).Decode(&listRes); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if listRes.Count != 3 {
		t.Fatalf("expected 3 skills, got %d", listRes.Count)
	}

	// Check scopes
	scopeMap := make(map[string]string)
	for _, sk := range listRes.Skills {
		scopeMap[sk.Name] = sk.Scope
	}

	if scopeMap["deploy-staging"] != "workspace" {
		t.Errorf("expected deploy-staging to have workspace scope, got %s", scopeMap["deploy-staging"])
	}
	if scopeMap["verify"] != "global" {
		t.Errorf("expected verify to have global scope, got %s", scopeMap["verify"])
	}
	if scopeMap["antigravity-guide"] != "builtin" {
		t.Errorf("expected antigravity-guide to have builtin scope, got %s", scopeMap["antigravity-guide"])
	}

	// Test GetSkillContent valid
	reqContent := httptest.NewRequest("GET", "/api/skills/content?path="+filepath.Join(wsSkillDir, "SKILL.md"), nil)
	reqContent.Header.Set("Authorization", "Bearer skill-token")
	wContent := httptest.NewRecorder()
	handler.GetSkillContent(wContent, reqContent)

	if wContent.Code != http.StatusOK {
		t.Fatalf("expected 200 for content, got %d: %s", wContent.Code, wContent.Body.String())
	}

	var contentRes SkillContentResponse
	if err := json.NewDecoder(wContent.Body).Decode(&contentRes); err != nil {
		t.Fatalf("failed to decode content response: %v", err)
	}
	if contentRes.Name != "deploy-staging" {
		t.Errorf("expected name deploy-staging, got %s", contentRes.Name)
	}
	if contentRes.Content != wsSkillContent {
		t.Errorf("content mismatch")
	}

	// Test GetSkillContent path traversal / invalid file
	reqBadContent := httptest.NewRequest("GET", "/api/skills/content?path=/etc/passwd", nil)
	reqBadContent.Header.Set("Authorization", "Bearer skill-token")
	wBadContent := httptest.NewRecorder()
	handler.GetSkillContent(wBadContent, reqBadContent)

	if wBadContent.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for non-SKILL.md path, got %d", wBadContent.Code)
	}
}

func TestSkillsHandler_ScaffoldSkill(t *testing.T) {
	tmpWorkspace, err := os.MkdirTemp("", "fake-ws-scaffold-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	// 1. Invalid name
	badJSON, _ := json.Marshal(map[string]string{
		"name":  "invalid name with spaces!",
		"scope": "workspace",
		"cwd":   tmpWorkspace,
	})
	reqBad := httptest.NewRequest("POST", "/api/skills/scaffold", bytes.NewReader(badJSON))
	reqBad.Header.Set("Authorization", "Bearer skill-token")
	wBad := httptest.NewRecorder()
	handler.ScaffoldSkill(wBad, reqBad)
	if wBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid name, got %d", wBad.Code)
	}

	// 2. Successful scaffold
	goodJSON, _ := json.Marshal(map[string]string{
		"name":        "code-review",
		"description": "Automated code review runbook",
		"scope":       "workspace",
		"cwd":         tmpWorkspace,
	})
	reqGood := httptest.NewRequest("POST", "/api/skills/scaffold", bytes.NewReader(goodJSON))
	reqGood.Header.Set("Authorization", "Bearer skill-token")
	wGood := httptest.NewRecorder()
	handler.ScaffoldSkill(wGood, reqGood)

	if wGood.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid scaffold, got %d: %s", wGood.Code, wGood.Body.String())
	}

	var item SkillItem
	if err := json.NewDecoder(wGood.Body).Decode(&item); err != nil {
		t.Fatalf("failed to decode scaffold response: %v", err)
	}
	if item.Name != "code-review" {
		t.Errorf("expected name code-review, got %s", item.Name)
	}

	// Verify file was written to disk
	createdFile := filepath.Join(tmpWorkspace, ".agents", "skills", "code-review", "SKILL.md")
	data, err := os.ReadFile(createdFile)
	if err != nil {
		t.Fatalf("created file does not exist: %v", err)
	}
	name, desc, _ := parseSkillFrontmatter(string(data))
	if name != "code-review" || desc != "Automated code review runbook" {
		t.Errorf("frontmatter mismatch in created file: name=%s, desc=%s", name, desc)
	}

	// 3. Conflict when scaffolding existing skill
	conflictJSON, _ := json.Marshal(map[string]string{
		"name":        "code-review",
		"description": "Duplicate",
		"scope":       "workspace",
		"cwd":         tmpWorkspace,
	})
	reqConflict := httptest.NewRequest("POST", "/api/skills/scaffold", bytes.NewReader(conflictJSON))
	reqConflict.Header.Set("Authorization", "Bearer skill-token")
	wConflict := httptest.NewRecorder()
	handler.ScaffoldSkill(wConflict, reqConflict)

	if wConflict.Code != http.StatusConflict {
		t.Errorf("expected 409 on duplicate skill, got %d: %s", wConflict.Code, wConflict.Body.String())
	}
}

func TestSkillsHandler_SearchSkills(t *testing.T) {
	mockSearchServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if q == "antislop" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"query":      "antislop",
				"searchType": "fuzzy",
				"skills": []map[string]any{
					{
						"id":       "miqdadbadjuber/anti-slop/antislop",
						"skillId":  "antislop",
						"name":     "antislop",
						"installs": 946,
						"source":   "miqdadbadjuber/anti-slop",
					},
				},
				"count": 1,
			})
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer mockSearchServer.Close()

	os.Setenv("SKILLS_SH_SEARCH_URL", mockSearchServer.URL)
	defer os.Unsetenv("SKILLS_SH_SEARCH_URL")

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	// 1. Successful remote search
	req := httptest.NewRequest("GET", "/api/skills/search?q=antislop", nil)
	req.Header.Set("Authorization", "Bearer skill-token")
	w := httptest.NewRecorder()
	handler.SearchSkills(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp SkillsSearchResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Count != 1 || len(resp.Skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", resp.Count)
	}
	if resp.Skills[0].Name != "antislop" {
		t.Errorf("expected skill antislop, got %s", resp.Skills[0].Name)
	}

	// 2. Fallback on non-200 or empty results
	reqFallback := httptest.NewRequest("GET", "/api/skills/search?q=improve", nil)
	reqFallback.Header.Set("Authorization", "Bearer skill-token")
	wFallback := httptest.NewRecorder()
	handler.SearchSkills(wFallback, reqFallback)

	if wFallback.Code != http.StatusOK {
		t.Fatalf("expected 200 for fallback, got %d", wFallback.Code)
	}
	var respFallback SkillsSearchResponse
	if err := json.NewDecoder(wFallback.Body).Decode(&respFallback); err != nil {
		t.Fatalf("failed to decode fallback response: %v", err)
	}
	if respFallback.Count == 0 {
		t.Errorf("expected fallback skills, got 0")
	}
	found := false
	for _, s := range respFallback.Skills {
		if s.Name == "improve" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected improve to be found in fallback list")
	}
}

func TestSkillsHandler_InstallSkill(t *testing.T) {
	tmpWorkspace, err := os.MkdirTemp("", "fake-ws-install-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	tmpSourceRepo, err := os.MkdirTemp("", "fake-source-repo-*")
	if err != nil {
		t.Fatalf("failed to create temp source repo: %v", err)
	}
	defer os.RemoveAll(tmpSourceRepo)

	skillDir := filepath.Join(tmpSourceRepo, "skills", "fixture-skill")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatalf("failed to create skill dir: %v", err)
	}
	skillContent := `---
name: fixture-skill
description: A fixture skill for testing installation
---
# Fixture Skill
Instructions here.`
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillContent), 0644); err != nil {
		t.Fatalf("failed to write fixture skill: %v", err)
	}

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	installReq := InstallSkillRequest{
		Source:    tmpSourceRepo,
		SkillName: "fixture-skill",
		Scope:     "workspace",
		Cwd:       tmpWorkspace,
	}
	body, _ := json.Marshal(installReq)
	req := httptest.NewRequest("POST", "/api/skills/install", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer skill-token")
	w := httptest.NewRecorder()
	handler.InstallSkill(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var installed SkillItem
	if err := json.NewDecoder(w.Body).Decode(&installed); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if installed.Name != "fixture-skill" {
		t.Errorf("expected fixture-skill, got %s", installed.Name)
	}

	installedFile := filepath.Join(tmpWorkspace, ".agents", "skills", "fixture-skill", "SKILL.md")
	data, err := os.ReadFile(installedFile)
	if err != nil {
		t.Fatalf("installed file does not exist: %v", err)
	}
	name, desc, _ := parseSkillFrontmatter(string(data))
	if name != "fixture-skill" || desc != "A fixture skill for testing installation" {
		t.Errorf("unexpected frontmatter: name=%s, desc=%s", name, desc)
	}

	lockPath := filepath.Join(tmpWorkspace, "skills-lock.json")
	lockData, err := os.ReadFile(lockPath)
	if err != nil {
		t.Fatalf("skills-lock.json not found: %v", err)
	}
	var lock SkillLockFile
	if err := json.Unmarshal(lockData, &lock); err != nil {
		t.Fatalf("failed to parse skills-lock.json: %v", err)
	}
	entry, exists := lock.Skills["fixture-skill"]
	if !exists {
		t.Fatalf("entry fixture-skill not in lockfile")
	}
	if entry.Source != tmpSourceRepo {
		t.Errorf("lock entry source mismatch: %s", entry.Source)
	}
	if entry.ComputedHash == "" {
		t.Errorf("computedHash should not be empty")
	}
}

func TestSkillsHandler_DeleteSkill(t *testing.T) {
	tmpWorkspace, err := os.MkdirTemp("", "fake-ws-delete-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	skillDir := filepath.Join(tmpWorkspace, ".agents", "skills", "to-delete")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatalf("failed to create skill dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("---\nname: to-delete\n---\n"), 0644); err != nil {
		t.Fatalf("failed to write skill file: %v", err)
	}

	lockPath := filepath.Join(tmpWorkspace, "skills-lock.json")
	lock := SkillLockFile{
		Version: 1,
		Skills: map[string]SkillLockEntry{
			"to-delete": {Source: "some/repo", SourceType: "github", ComputedHash: "123"},
		},
	}
	lockBytes, _ := json.Marshal(lock)
	_ = os.WriteFile(lockPath, lockBytes, 0644)

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	// 1. Delete workspace skill
	req := httptest.NewRequest("DELETE", "/api/skills?name=to-delete&scope=workspace&cwd="+tmpWorkspace, nil)
	req.Header.Set("Authorization", "Bearer skill-token")
	w := httptest.NewRecorder()
	handler.DeleteSkill(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if _, err := os.Stat(skillDir); !os.IsNotExist(err) {
		t.Errorf("expected skill directory to be deleted")
	}

	lockAfter, err := loadSkillLock(lockPath)
	if err != nil {
		t.Fatalf("failed to load lockfile after delete: %v", err)
	}
	if _, exists := lockAfter.Skills["to-delete"]; exists {
		t.Errorf("expected to-delete to be removed from lockfile")
	}

	// 2. Builtin skill deletion guard
	reqBuiltin := httptest.NewRequest("DELETE", "/api/skills?name=antigravity-guide&scope=builtin", nil)
	reqBuiltin.Header.Set("Authorization", "Bearer skill-token")
	wBuiltin := httptest.NewRecorder()
	handler.DeleteSkill(wBuiltin, reqBuiltin)

	if wBuiltin.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for builtin deletion, got %d", wBuiltin.Code)
	}
}

func TestSkillsHandler_SyncSkills(t *testing.T) {
	tmpWorkspace, err := os.MkdirTemp("", "fake-ws-sync-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	tmpSourceRepo, err := os.MkdirTemp("", "fake-source-repo-sync-*")
	if err != nil {
		t.Fatalf("failed to create temp source repo: %v", err)
	}
	defer os.RemoveAll(tmpSourceRepo)

	skillDir := filepath.Join(tmpSourceRepo, "skills", "restore-skill")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatalf("failed to create skill dir: %v", err)
	}
	skillContent := `---
name: restore-skill
description: A skill to restore via sync
---
# Restore Skill`
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillContent), 0644); err != nil {
		t.Fatalf("failed to write skill file: %v", err)
	}

	lockPath := filepath.Join(tmpWorkspace, "skills-lock.json")
	lock := SkillLockFile{
		Version: 1,
		Skills: map[string]SkillLockEntry{
			"restore-skill": {
				Source:       tmpSourceRepo,
				SourceType:   "github",
				SkillPath:    "skills/restore-skill/SKILL.md",
				ComputedHash: "abc",
			},
		},
	}
	lockBytes, _ := json.Marshal(lock)
	_ = os.WriteFile(lockPath, lockBytes, 0644)

	cfg := &config.Config{AuthToken: "skill-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	req := httptest.NewRequest("POST", "/api/skills/sync?cwd="+tmpWorkspace, nil)
	req.Header.Set("Authorization", "Bearer skill-token")
	w := httptest.NewRecorder()
	handler.SyncSkills(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var syncResp SyncSkillsResponse
	if err := json.NewDecoder(w.Body).Decode(&syncResp); err != nil {
		t.Fatalf("failed to decode sync response: %v", err)
	}

	if syncResp.Synced != 1 {
		t.Errorf("expected 1 synced, got %d", syncResp.Synced)
	}
	if len(syncResp.Restored) != 1 || syncResp.Restored[0] != "restore-skill" {
		t.Errorf("expected restore-skill in restored list, got %v", syncResp.Restored)
	}

	restoredFile := filepath.Join(tmpWorkspace, ".agents", "skills", "restore-skill", "SKILL.md")
	if _, err := os.Stat(restoredFile); os.IsNotExist(err) {
		t.Errorf("restored file does not exist at %s", restoredFile)
	}
}
