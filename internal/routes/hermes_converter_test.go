package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/config"
)

func TestHermesConverter_Detection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hermes-test-detect-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Empty dir: false
	if DetectHermesPlugin(tmpDir) {
		t.Errorf("expected false for empty directory")
	}

	// Dir with plugin.yaml: true
	manifestPath := filepath.Join(tmpDir, "plugin.yaml")
	if err := os.WriteFile(manifestPath, []byte("name: test-plugin\n"), 0644); err != nil {
		t.Fatalf("failed to write manifest: %v", err)
	}
	if !DetectHermesPlugin(tmpDir) {
		t.Errorf("expected true for dir with plugin.yaml")
	}
	_ = os.Remove(manifestPath)

	// Dir with tools.py: true
	toolsPath := filepath.Join(tmpDir, "tools.py")
	if err := os.WriteFile(toolsPath, []byte("def hello(): pass\n"), 0644); err != nil {
		t.Fatalf("failed to write tools.py: %v", err)
	}
	if !DetectHermesPlugin(tmpDir) {
		t.Errorf("expected true for dir with tools.py")
	}
	_ = os.Remove(toolsPath)

	// Nested dir with plugin.yaml: true
	subDir := filepath.Join(tmpDir, "nested-plugin")
	_ = os.MkdirAll(subDir, 0755)
	_ = os.WriteFile(filepath.Join(subDir, "plugin.yml"), []byte("name: nested\n"), 0644)
	if !DetectHermesPlugin(tmpDir) {
		t.Errorf("expected true for nested plugin directory")
	}
	if got := FindHermesPluginDir(tmpDir); got != subDir {
		t.Errorf("FindHermesPluginDir = %q, want %q", got, subDir)
	}
}

func TestHermesConverter_ParseManifest(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hermes-test-manifest-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	manifestContent := `
name: crypto-tracker
version: 1.2.0
description: >-
  Real-time crypto price tracker
  supporting multiple coins.
requires_env:
  - CRYPTO_API_KEY
optional_env:
  - CRYPTO_CURRENCY
  - CACHE_TTL
`
	manifestPath := filepath.Join(tmpDir, "plugin.yaml")
	if err := os.WriteFile(manifestPath, []byte(manifestContent), 0644); err != nil {
		t.Fatalf("failed to write manifest: %v", err)
	}

	name, version, desc, reqEnv, optEnv, err := ParseHermesManifest(manifestPath)
	if err != nil {
		t.Fatalf("ParseHermesManifest failed: %v", err)
	}

	if name != "crypto-tracker" {
		t.Errorf("name = %q, want crypto-tracker", name)
	}
	if version != "1.2.0" {
		t.Errorf("version = %q, want 1.2.0", version)
	}
	if !strings.Contains(desc, "Real-time crypto price tracker") {
		t.Errorf("desc = %q, want containing 'Real-time crypto price tracker'", desc)
	}
	if len(reqEnv) != 1 || reqEnv[0] != "CRYPTO_API_KEY" {
		t.Errorf("reqEnv = %v, want [CRYPTO_API_KEY]", reqEnv)
	}
	if len(optEnv) != 2 || optEnv[0] != "CRYPTO_CURRENCY" || optEnv[1] != "CACHE_TTL" {
		t.Errorf("optEnv = %v, want [CRYPTO_CURRENCY, CACHE_TTL]", optEnv)
	}
}

func TestHermesConverter_ExtractTools(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hermes-test-tools-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	toolsCode := `
def get_price(coin: str = "btc", currency: str = "usd") -> dict:
    """Fetch current crypto price.

    Args:
        coin: Cryptocurrency ticker symbol
        currency: Target fiat currency
    """
    return {"coin": coin, "price": 50000}

async def alert_price(threshold: float, coin: str = "btc"):
    """Set price alert.
    
    Args:
        threshold: Price limit
        coin: Ticker symbol
    """
    pass

def _internal_helper():
    pass

def register(ctx):
    pass
`
	toolsPath := filepath.Join(tmpDir, "tools.py")
	if err := os.WriteFile(toolsPath, []byte(toolsCode), 0644); err != nil {
		t.Fatalf("failed to write tools.py: %v", err)
	}

	tools, err := ExtractPythonTools(toolsPath, "")
	if err != nil {
		t.Fatalf("ExtractPythonTools failed: %v", err)
	}

	if len(tools) != 2 {
		t.Fatalf("extracted tools count = %d, want 2", len(tools))
	}

	t0 := tools[0]
	if t0.Name != "get_price" {
		t.Errorf("tool[0].Name = %q, want get_price", t0.Name)
	}
	if !strings.Contains(t0.Description, "Fetch current crypto price") {
		t.Errorf("tool[0].Description = %q", t0.Description)
	}
	if len(t0.Parameters) != 2 {
		t.Fatalf("tool[0].Parameters len = %d, want 2", len(t0.Parameters))
	}
	if t0.Parameters[0].Name != "coin" || t0.Parameters[0].Default != "btc" || t0.Parameters[0].Required != false {
		t.Errorf("tool[0].Parameters[0] mismatch: %+v", t0.Parameters[0])
	}
	if t0.Parameters[1].Name != "currency" || t0.Parameters[1].Default != "usd" || t0.Parameters[1].Required != false {
		t.Errorf("tool[0].Parameters[1] mismatch: %+v", t0.Parameters[1])
	}

	t1 := tools[1]
	if t1.Name != "alert_price" {
		t.Errorf("tool[1].Name = %q, want alert_price", t1.Name)
	}
	if len(t1.Parameters) != 2 {
		t.Fatalf("tool[1].Parameters len = %d, want 2", len(t1.Parameters))
	}
	if t1.Parameters[0].Name != "threshold" || t1.Parameters[0].Required != true {
		t.Errorf("tool[1].Parameters[0] (threshold) should be required: %+v", t1.Parameters[0])
	}
}

func TestHermesConverter_GenerateMarkdown(t *testing.T) {
	meta := HermesPluginMetadata{
		Name:        "crypto-tracker",
		Version:     "1.0.0",
		Description: "Real-time cryptocurrency price alerts",
		RequiresEnv: []string{"CRYPTO_API_KEY"},
		OptionalEnv: []string{"CRYPTO_CURRENCY"},
		Tools: []HermesToolDef{
			{
				Name:        "get_price",
				Description: "Get current crypto price",
				Parameters: []HermesToolParam{
					{
						Name:        "coin",
						Type:        "string",
						Required:    false,
						Default:     "btc",
						Description: "Ticker symbol",
					},
				},
			},
		},
	}

	md := GenerateSkillMarkdown(meta)

	if !strings.HasPrefix(md, "---\nname: crypto-tracker\n") {
		t.Errorf("markdown missing YAML frontmatter: %s", md[:50])
	}
	if !strings.Contains(md, "# Crypto Tracker") {
		t.Errorf("markdown missing title")
	}
	if !strings.Contains(md, "CRYPTO_API_KEY") {
		t.Errorf("markdown missing required env var")
	}
	if !strings.Contains(md, "| Parameter | Type | Required | Default | Description |") {
		t.Errorf("markdown missing parameter table")
	}
	if !strings.Contains(md, "python3 scripts/runner.py get_price") {
		t.Errorf("markdown missing CLI runner command example")
	}
}

func TestHermesConverter_EndToEndConversion(t *testing.T) {
	tmpWorkspace, err := os.MkdirTemp("", "hermes-e2e-ws-*")
	if err != nil {
		t.Fatalf("failed to create temp workspace: %v", err)
	}
	defer os.RemoveAll(tmpWorkspace)

	// Create fake git directory in workspace
	_ = os.MkdirAll(filepath.Join(tmpWorkspace, ".git"), 0755)

	// Create fixture Hermes plugin
	fixtureDir, err := os.MkdirTemp("", "hermes-fixture-*")
	if err != nil {
		t.Fatalf("failed to create fixture dir: %v", err)
	}
	defer os.RemoveAll(fixtureDir)

	manifest := `
name: test-hermes-plugin
version: 0.9.1
description: Test Hermes plugin converter
requires_env:
  - TEST_SECRET_KEY
`
	toolsPy := `
def run_action(message: str = "pong"):
    """Echo action."""
    return {"message": message}
`
	if err := os.WriteFile(filepath.Join(fixtureDir, "plugin.yaml"), []byte(manifest), 0644); err != nil {
		t.Fatalf("failed to write fixture manifest: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fixtureDir, "tools.py"), []byte(toolsPy), 0644); err != nil {
		t.Fatalf("failed to write fixture tools.py: %v", err)
	}

	cfg := &config.Config{AuthToken: "test-token"}
	auth := NewAuthHelper(cfg)
	handler := NewSkillsHandler(auth, nil)

	// 1. Test POST /api/skills/convert-hermes
	reqBody := ConvertHermesRequest{
		Source:     fixtureDir,
		CustomName: "test-hermes-plugin",
		Scope:      "workspace",
		Cwd:        tmpWorkspace,
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/skills/convert-hermes", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ConvertHermesPlugin(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("ConvertHermesPlugin returned status %d: %s", w.Code, w.Body.String())
	}

	var item SkillItem
	if err := json.Unmarshal(w.Body.Bytes(), &item); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if item.Name != "test-hermes-plugin" {
		t.Errorf("item.Name = %q, want test-hermes-plugin", item.Name)
	}

	// Verify target files exist
	skillDir := filepath.Join(tmpWorkspace, ".agents", "skills", "test-hermes-plugin")
	skillMdFile := filepath.Join(skillDir, "SKILL.md")
	if fi, err := os.Stat(skillMdFile); err != nil || fi.IsDir() {
		t.Errorf("SKILL.md not found in %s", skillDir)
	}

	runnerFile := filepath.Join(skillDir, "scripts", "runner.py")
	if fi, err := os.Stat(runnerFile); err != nil || fi.IsDir() {
		t.Errorf("runner.py not found in %s", skillDir)
	} else if fi.Mode()&0111 == 0 {
		t.Errorf("runner.py is not executable: mode=%v", fi.Mode())
	}

	toolsCopy := filepath.Join(skillDir, "scripts", "tools.py")
	if fi, err := os.Stat(toolsCopy); err != nil || fi.IsDir() {
		t.Errorf("tools.py not found in %s/scripts", skillDir)
	}

	// Verify skills-lock.json
	lockPath := filepath.Join(tmpWorkspace, "skills-lock.json")
	lock, err := loadSkillLock(lockPath)
	if err != nil {
		t.Fatalf("failed to load skills-lock.json: %v", err)
	}
	entry, exists := lock.Skills["test-hermes-plugin"]
	if !exists {
		t.Fatalf("skills-lock.json missing test-hermes-plugin entry")
	}
	if entry.SourceType != "hermes-plugin" {
		t.Errorf("entry.SourceType = %q, want hermes-plugin", entry.SourceType)
	}

	// 2. Test Invalid Source (non-Hermes directory)
	emptyDir, _ := os.MkdirTemp("", "empty-dir-*")
	defer os.RemoveAll(emptyDir)

	invalidReqBody := ConvertHermesRequest{
		Source: emptyDir,
		Scope:  "workspace",
		Cwd:    tmpWorkspace,
	}
	invBytes, _ := json.Marshal(invalidReqBody)
	invReq := httptest.NewRequest("POST", "/api/skills/convert-hermes", bytes.NewReader(invBytes))
	invReq.Header.Set("Authorization", "Bearer test-token")
	invReq.Header.Set("Content-Type", "application/json")
	invW := httptest.NewRecorder()

	handler.ConvertHermesPlugin(invW, invReq)

	if invW.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for non-Hermes dir, got %d: %s", invW.Code, invW.Body.String())
	}
}
