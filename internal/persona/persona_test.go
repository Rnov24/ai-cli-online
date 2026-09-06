package persona

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPersonaDetection(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		t.Skip("UserHomeDir not available")
	}

	// 1. Exact Home
	if !IsHomeDirectory(home) {
		t.Errorf("Expected IsHomeDirectory(%q) to be true", home)
	}
	if ResolveAgentMode(home) != ModeAgenticAssistant {
		t.Errorf("Expected ResolveAgentMode(%q) to be %s", home, ModeAgenticAssistant)
	}

	// 2. Trailing Slash
	homeWithSlash := home + string(filepath.Separator)
	if !IsHomeDirectory(homeWithSlash) {
		t.Errorf("Expected IsHomeDirectory with trailing slash to be true")
	}

	// 3. Sub-directory of Home should NOT be Home
	subDir := filepath.Join(home, "some_project_subfolder")
	if IsHomeDirectory(subDir) {
		t.Errorf("Expected IsHomeDirectory(%q) to be false", subDir)
	}
	if ResolveAgentMode(subDir) != ModeCodingAgent {
		t.Errorf("Expected ResolveAgentMode(%q) to be %s", subDir, ModeCodingAgent)
	}

	// 4. Empty string should not be Home
	if IsHomeDirectory("") {
		t.Errorf("Expected IsHomeDirectory(\"\") to be false")
	}
}

func TestPresetPersonasRegistry(t *testing.T) {
	presets := GetAllPresetPersonas()
	if len(presets) != 6 {
		t.Fatalf("Expected 6 preset personas, got %d", len(presets))
	}

	expectedIds := []string{
		"coding-agent",
		"agentic-assistant",
		"architect",
		"auditor",
		"pair-programmer",
		"sre",
	}

	for _, id := range expectedIds {
		p, found := GetPresetPersona(id)
		if !found {
			t.Errorf("Expected preset %q to be found", id)
		}
		if p.Id != id {
			t.Errorf("Expected preset Id %q, got %q", id, p.Id)
		}
		if p.Name == "" || p.Directive == "" || p.Role == "" {
			t.Errorf("Preset %q has missing fields: %+v", id, p)
		}
	}
}

func TestResolvePersona(t *testing.T) {
	home, _ := os.UserHomeDir()
	projectDir := filepath.Join(home, "proj")

	// Explicit persona ID
	arch := ResolvePersona("architect", projectDir)
	if arch.Id != "architect" {
		t.Errorf("Expected architect persona, got %s", arch.Id)
	}

	// Unknown persona ID falls back to directory default
	fallbackHome := ResolvePersona("unknown-role", home)
	if fallbackHome.Id != "agentic-assistant" {
		t.Errorf("Expected fallback to agentic-assistant in home, got %s", fallbackHome.Id)
	}

	fallbackProj := ResolvePersona("", projectDir)
	if fallbackProj.Id != "coding-agent" {
		t.Errorf("Expected fallback to coding-agent in project, got %s", fallbackProj.Id)
	}
}

func TestBuildPromptWithPersonaConfig(t *testing.T) {
	home, _ := os.UserHomeDir()
	projectDir := filepath.Join(home, "my-go-project")
	testPrompt := "list all files"

	auditor, _ := GetPresetPersona("auditor")

	// Initial prompt with Auditor persona
	auditorPrompt := BuildPromptWithPersonaConfig(projectDir, testPrompt, "", auditor)
	if !strings.Contains(auditorPrompt, "Persona=Security Auditor") {
		t.Errorf("Expected initial prompt to contain Security Auditor directive, got: %s", auditorPrompt)
	}
	if !strings.Contains(auditorPrompt, testPrompt) {
		t.Errorf("Expected prompt to contain testPrompt")
	}

	// Resumed prompt with Auditor persona
	auditorResume := BuildPromptWithPersonaConfig(projectDir, testPrompt, "conv-999", auditor)
	if !strings.Contains(auditorResume, "Security Auditor (auditor)") {
		t.Errorf("Expected resumed prompt to contain persona identifier tag, got: %s", auditorResume)
	}
}

func TestBuildPromptWithPersona(t *testing.T) {
	home, _ := os.UserHomeDir()
	testPrompt := "list all files"

	// Home initial prompt
	homePrompt := BuildPromptWithPersona(home, testPrompt, "")
	if !strings.Contains(homePrompt, "Persona=Agentic Assistant") {
		t.Errorf("Expected Home initial prompt to include Agentic Assistant directive, got: %s", homePrompt)
	}
	if !strings.Contains(homePrompt, testPrompt) {
		t.Errorf("Expected Home initial prompt to contain original prompt")
	}

	// Home resumption prompt
	homeResumePrompt := BuildPromptWithPersona(home, testPrompt, "conv-123")
	if !strings.Contains(homeResumePrompt, "Agentic Assistant (agentic-assistant)") {
		t.Errorf("Expected Home resume prompt to include Agentic Assistant tag, got: %s", homeResumePrompt)
	}

	// Project initial prompt
	projectDir := filepath.Join(home, "my-go-project")
	projectPrompt := BuildPromptWithPersona(projectDir, testPrompt, "")
	if !strings.Contains(projectPrompt, "Persona=Coding Agent") {
		t.Errorf("Expected Project initial prompt to include Coding Agent directive, got: %s", projectPrompt)
	}

	// Project resumption prompt
	projectResumePrompt := BuildPromptWithPersona(projectDir, testPrompt, "conv-456")
	if !strings.Contains(projectResumePrompt, "Coding Agent (coding-agent)") {
		t.Errorf("Expected Project resume prompt to include Coding Agent tag, got: %s", projectResumePrompt)
	}
}
