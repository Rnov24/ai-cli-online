package persona

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type AgentMode string

const (
	ModeAgenticAssistant AgentMode = "agentic-assistant"
	ModeCodingAgent      AgentMode = "coding-agent"
)

const HomeAssistantDirective = `[System Directive: Environment=Home Directory (~). Persona=Agentic Assistant]
You are operating as an autonomous Agentic Personal Assistant and System Orchestrator.
- Primary Responsibilities: Personal productivity, task planning, timer/cron scheduling (/schedule), learning user preferences (/learn), system health diagnostics (/doctor), web research (/browser), file organization, and workspace management.
- CRITICAL SCOPE BOUNDARY: The current working directory is the user's personal home root (~), NOT a git software repository or coding project.
- Do NOT assume git version control exists here.
- Do NOT run git commits, test suites, or package build tools on this directory unless explicitly instructed by the user.
- If the user wishes to build software, write codebases, or run task loops, guide them to switch to or create a dedicated project workspace using /workspace.
`

const ProjectCodingDirective = `[System Directive: Environment=Project Workspace. Persona=Coding Agent]
You are operating as an Autonomous AI Coding Agent & Pair Programmer.
- Primary Responsibilities: Software engineering, codebase comprehension, git version control, implementation planning (/plan, /grill-me), code refactoring, testing (/verify), and task lifecycle execution (ai-cli-task: /auto, /exec, /check, /merge).
- Read and respect project-level directives (AGENTS.md, GEMINI.md) and task state in AiTasks/.
`

// IsHomeDirectory reports whether the given path resolves to the user's home directory.
func IsHomeDirectory(targetPath string) bool {
	if targetPath == "" {
		return false
	}

	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return false
	}

	cleanTarget := filepath.Clean(targetPath)
	cleanHome := filepath.Clean(home)

	// Resolve symlinks if possible
	if evalTarget, err := filepath.EvalSymlinks(cleanTarget); err == nil {
		cleanTarget = evalTarget
	}
	if evalHome, err := filepath.EvalSymlinks(cleanHome); err == nil {
		cleanHome = evalHome
	}

	if runtime.GOOS == "windows" {
		return strings.EqualFold(cleanTarget, cleanHome)
	}
	return cleanTarget == cleanHome
}

// ResolveAgentMode determines whether the working directory warrants an Agentic Assistant or Coding Agent persona.
func ResolveAgentMode(workingDir string) AgentMode {
	if IsHomeDirectory(workingDir) {
		return ModeAgenticAssistant
	}
	return ModeCodingAgent
}

// BuildPromptWithPersona wraps the user prompt with contextual persona directives based on the active directory.
func BuildPromptWithPersona(workingDir, prompt, conversationId string) string {
	isHome := IsHomeDirectory(workingDir)

	if isHome {
		if conversationId == "" {
			return HomeAssistantDirective + "\n" + prompt
		}
		return "[Context: Location=Home (~). Persona=Agentic Assistant]\n\n" + prompt
	}

	if conversationId == "" {
		return ProjectCodingDirective + "\n" + prompt
	}
	return "[Context: Location=Project Workspace. Persona=Coding Agent]\n\n" + prompt
}
