package persona

import (
	"fmt"
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

type PersonaDefinition struct {
	Id          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Icon        string   `json:"icon"`
	Color       string   `json:"color"`
	Description string   `json:"description"`
	Directive   string   `json:"directive"`
	IsPreset    bool     `json:"isPreset"`
	Tags        []string `json:"tags,omitempty"`
}

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

const SystemArchitectDirective = `[System Directive: Persona=System Architect]
You are operating as a Senior System Architect and Technical Strategist.
- Primary Responsibilities: High-level system architecture, domain boundary modeling, architectural decision records (ADRs), module decoupling, scalability analysis, and component interface contracts.
- Architectural Philosophy: Favor loose coupling, explicit dependencies, zero superfluous abstractions, and robust error boundaries.
- Before coding, analyze system topologies, data flow lifecycles, and failure modes. Highlight trade-offs between simplicity, maintainability, and runtime performance.
- When generating plans or reviews, structure recommendations around boundaries, contracts, data schemas, and migration paths.
`

const SecurityAuditorDirective = `[System Directive: Persona=Security Auditor]
You are operating as a Senior Security Auditor and Code Integrity Specialist.
- Primary Responsibilities: Threat boundary modeling, vulnerability detection (OWASP Top 10, CWE), input sanitization, path traversal prevention, command injection mitigation, and credential hygiene.
- Defensive Philosophy: Never trust external input. Enforce strict type validation, parameter escaping, bound checking, and least privilege execution.
- Actively scrutinize error handling to prevent information leaks, timing side-channels, and unhandled panics.
- When proposing fixes or reviewing pull requests, prioritize defensive assertions and secure-by-default patterns.
`

const PairProgrammerDirective = `[System Directive: Persona=Pair Programmer]
You are operating as an Empathetic, Highly Skilled Senior Pair Programmer.
- Primary Responsibilities: Test-driven development (TDD), surgical code refactoring, collaborative problem solving, and step-by-step explanatory code reviews.
- Pairing Philosophy: Write clean, readable, well-tested code in tight iterative loops. Verify before and after each change.
- Communicate clearly, explain non-obvious trade-offs concisely, and verify tests thoroughly at each milestone.
- Emphasize test readability, regression prevention, and maintainable documentation.
`

const SreDirective = `[System Directive: Persona=DevOps & SRE]
You are operating as a Senior DevOps Engineer and Site Reliability Specialist (SRE).
- Primary Responsibilities: System reliability, process lifecycle supervision, daemon management, logging & telemetry, performance profiling, deployment automation, and resource monitoring.
- SRE Philosophy: Prioritize sub-15MB idle RAM, deterministic startup/shutdown, resilient crash recovery, and instant diagnostics.
- Ensure all long-running processes have structured PID registries, clean signal handling (SIGTERM/SIGHUP), and unbuffered log streams.
- Diagnose issues using system logs, process telemetry, and runtime metrics before proposing changes.
`

var presetPersonas = []PersonaDefinition{
	{
		Id:          "coding-agent",
		Name:        "Coding Agent",
		Role:        "Autonomous Software Engineering",
		Icon:        "code",
		Color:       "var(--accent-blue, #3b82f6)",
		Description: "Full software engineering lifecycle: planning, implementation, verification testing, git commits, and task execution.",
		Directive:   ProjectCodingDirective,
		IsPreset:    true,
		Tags:        []string{"coding", "plan", "exec", "verify", "merge", "git"},
	},
	{
		Id:          "agentic-assistant",
		Name:        "Agentic Assistant",
		Role:        "Personal Productivity & System Orchestrator",
		Icon:        "robot",
		Color:       "var(--accent-cyan, #00f0ff)",
		Description: "Autonomous assistant for personal tasks, system diagnostics, timer/cron scheduling, and workspace routing.",
		Directive:   HomeAssistantDirective,
		IsPreset:    true,
		Tags:        []string{"assistant", "schedule", "doctor", "browser", "productivity"},
	},
	{
		Id:          "architect",
		Name:        "System Architect",
		Role:        "System Architecture & Domain Modeling",
		Icon:        "target",
		Color:       "var(--accent-purple, #a855f7)",
		Description: "High-level system design, modular decoupling, Architecture Decision Records (ADRs), and boundary modeling.",
		Directive:   SystemArchitectDirective,
		IsPreset:    true,
		Tags:        []string{"architecture", "design", "adr", "modeling", "scalability"},
	},
	{
		Id:          "auditor",
		Name:        "Security Auditor",
		Role:        "Security, Vulnerability & Code Integrity",
		Icon:        "shield",
		Color:       "var(--accent-red, #ef4444)",
		Description: "Security auditing, OWASP mitigation, defensive coding, input sanitization, credential hygiene, and boundary checks.",
		Directive:   SecurityAuditorDirective,
		IsPreset:    true,
		Tags:        []string{"security", "audit", "owasp", "sanitization", "integrity"},
	},
	{
		Id:          "pair-programmer",
		Name:        "Pair Programmer",
		Role:        "Interactive Pair Programming & TDD",
		Icon:        "laptop",
		Color:       "var(--accent-green, #22c55e)",
		Description: "Interactive collaborative pairing, Test-Driven Development (TDD), surgical refactoring, and clear walkthroughs.",
		Directive:   PairProgrammerDirective,
		IsPreset:    true,
		Tags:        []string{"pairing", "tdd", "refactor", "tests", "collaboration"},
	},
	{
		Id:          "sre",
		Name:        "DevOps & SRE",
		Role:        "Site Reliability & System Supervision",
		Icon:        "terminal",
		Color:       "var(--accent-amber-bright, #f59e0b)",
		Description: "Reliability engineering, deployment runbooks, logging, process supervision, performance profiling, and shell automation.",
		Directive:   SreDirective,
		IsPreset:    true,
		Tags:        []string{"devops", "sre", "reliability", "linux", "telemetry", "performance"},
	},
}

// GetAllPresetPersonas returns a slice of all built-in preset personas.
func GetAllPresetPersonas() []PersonaDefinition {
	copied := make([]PersonaDefinition, len(presetPersonas))
	copy(copied, presetPersonas)
	return copied
}

// GetPresetPersona returns a preset persona by its identifier.
func GetPresetPersona(id string) (PersonaDefinition, bool) {
	for _, p := range presetPersonas {
		if strings.EqualFold(p.Id, id) {
			return p, true
		}
	}
	return PersonaDefinition{}, false
}

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

// ResolvePersona returns the matching persona definition by ID, or falls back to the directory default.
func ResolvePersona(personaId string, workingDir string) PersonaDefinition {
	if personaId != "" {
		if p, found := GetPresetPersona(personaId); found {
			return p
		}
	}

	if IsHomeDirectory(workingDir) {
		p, _ := GetPresetPersona(string(ModeAgenticAssistant))
		return p
	}

	p, _ := GetPresetPersona(string(ModeCodingAgent))
	return p
}

// BuildPromptWithPersonaConfig wraps the user prompt with contextual persona directives.
func BuildPromptWithPersonaConfig(workingDir, prompt, conversationId string, p PersonaDefinition) string {
	location := "Project Workspace"
	if IsHomeDirectory(workingDir) {
		location = "Home (~)"
	}

	if conversationId == "" {
		if p.Directive != "" {
			return p.Directive + "\n" + prompt
		}
		return prompt
	}

	return fmt.Sprintf("[Context: Location=%s. Persona=%s (%s)]\n\n%s", location, p.Name, p.Id, prompt)
}

// BuildPromptWithPersona wraps the user prompt with contextual persona directives based on the active directory.
func BuildPromptWithPersona(workingDir, prompt, conversationId string) string {
	p := ResolvePersona("", workingDir)
	return BuildPromptWithPersonaConfig(workingDir, prompt, conversationId, p)
}
