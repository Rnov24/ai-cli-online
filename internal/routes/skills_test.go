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
