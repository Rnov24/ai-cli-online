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
	if !strings.Contains(projectResumePrompt, "Persona=Coding Agent") {
		t.Errorf("Expected Project resume prompt to include Coding Agent tag, got: %s", projectResumePrompt)
	}
}
