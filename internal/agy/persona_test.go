package agy

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
	if !strings.Contains(homeResumePrompt, "Persona=Agentic Assistant") {
		t.Errorf("Expected Home resumption prompt to include compact context reminder")
	}

	// Project initial prompt
	projDir := filepath.Join(home, "projects", "my-app")
	projPrompt := BuildPromptWithPersona(projDir, testPrompt, "")
	if !strings.Contains(projPrompt, "Persona=Coding Agent") {
		t.Errorf("Expected project prompt to include Coding Agent directive")
	}

	// Project resumption prompt
	projResumePrompt := BuildPromptWithPersona(projDir, testPrompt, "conv-123")
	if projResumePrompt != testPrompt {
		t.Errorf("Expected project resumption prompt to be unmodified, got: %s", projResumePrompt)
	}
}
