package agy

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/huacheng/ai-cli-online/internal/persona"
)

type StreamEvent struct {
	Event        string          `json:"event"`
	TurnId       string          `json:"turn_id,omitempty"`
	Error        string          `json:"error,omitempty"`
	StepIndex    int             `json:"step_index,omitempty"`
	Delta        string          `json:"delta,omitempty"`
	Thinking     string          `json:"thinking,omitempty"`
	ToolCall     *ToolCallData   `json:"tool_call,omitempty"`
	Status       string          `json:"status,omitempty"`
	Conversation string          `json:"conversation_id,omitempty"`
	FullResponse string          `json:"full_response,omitempty"`
	DurationSec  float64         `json:"duration_seconds,omitempty"`
	TokensTotal  int             `json:"tokens_total,omitempty"`
	Init         *InitData       `json:"init,omitempty"`
}

type InitData struct {
	Cwd   string   `json:"cwd"`
	Tools []string `json:"tools"`
}

type ToolCallData struct {
	Id       string         `json:"id"`
	Name     string         `json:"name"`
	Args     map[string]any `json:"args,omitempty"`
	Output   string         `json:"output,omitempty"`
	Status   string         `json:"status"` // "running" | "success" | "error"
	Duration float64        `json:"duration,omitempty"`
}

type ActiveRunner struct {
	cmd    *exec.Cmd
	cancel context.CancelFunc
}

var (
	activeMu      sync.Mutex
	activeRunners = make(map[string]*ActiveRunner)
)

func StopSession(sessionId string) {
	activeMu.Lock()
	defer activeMu.Unlock()
	if runner, ok := activeRunners[sessionId]; ok {
		if runner.cancel != nil {
			runner.cancel()
		}
		if runner.cmd != nil && runner.cmd.Process != nil {
			_ = runner.cmd.Process.Kill()
		}
		delete(activeRunners, sessionId)
	}
}

// ResolveAgyBinary locates the agy executable across PATH and known user install paths.
func ResolveAgyBinary() string {
	if p, err := exec.LookPath("agy"); err == nil {
		return p
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidates := []string{
			filepath.Join(home, ".gemini", "antigravity-cli", "bin", "agy"),
			filepath.Join(home, ".gemini", "antigravity-cli", "bin", "agy.exe"),
			filepath.Join(home, "AppData", "Local", "agy", "bin", "agy.exe"),
			filepath.Join(home, ".local", "bin", "agy"),
			filepath.Join(home, "bin", "agy"),
			filepath.Join(home, "go", "bin", "agy"),
			filepath.Join(home, "go", "bin", "agy.exe"),
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c
			}
		}
	}
	if prefix := os.Getenv("PREFIX"); prefix != "" {
		p := filepath.Join(prefix, "bin", "agy")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
		p := filepath.Join(localApp, "agy", "bin", "agy.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "agy"
}

func RunPromptStream(
	ctx context.Context,
	sessionId string,
	workingDir string,
	conversationId string,
	prompt string,
	personaId string,
	onEvent func(event StreamEvent),
) (string, string, error) {
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	pDef := persona.ResolvePersona(personaId, workingDir)
	resolvedPrompt := persona.BuildPromptWithPersonaConfig(workingDir, prompt, conversationId, pDef)

	args := []string{
		"-p", resolvedPrompt,
		"--output-format", "stream-json",
		"--dangerously-skip-permissions",
	}

	if conversationId != "" {
		args = append(args, "--conversation", conversationId)
	}

	agyBin := ResolveAgyBinary()
	cmd := exec.CommandContext(runCtx, agyBin, args...)
	if workingDir != "" {
		cmd.Dir = workingDir
	}

	cmd.Stdin = strings.NewReader("")

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", "", fmt.Errorf("failed to start agy (%s): %w", agyBin, err)
	}

	activeMu.Lock()
	activeRunners[sessionId] = &ActiveRunner{cmd: cmd, cancel: cancel}
	activeMu.Unlock()

	defer func() {
		activeMu.Lock()
		delete(activeRunners, sessionId)
		activeMu.Unlock()
	}()

	parseRes, _ := ParseStream(stdout, onEvent)
	fullResponse := parseRes.FullResponse
	finalConvId := parseRes.ConversationId
	if finalConvId == "" {
		finalConvId = conversationId
	}

	waitErr := cmd.Wait()
	if waitErr != nil {
		stderrStr := strings.TrimSpace(stderrBuf.String())
		errMsg := waitErr.Error()
		if stderrStr != "" {
			errMsg = fmt.Sprintf("%s: %s", errMsg, stderrStr)
		}
		if fullResponse == "" {
			onEvent(StreamEvent{
				Event:        "error",
				Status:       "error",
				Error:        errMsg,
				FullResponse: errMsg,
				Conversation: finalConvId,
			})
			return "", finalConvId, fmt.Errorf("agy execution failed: %s", errMsg)
		}
	}

	if fullResponse == "" {
		fullResponse = "Completed."
	}

	return fullResponse, finalConvId, nil
}
