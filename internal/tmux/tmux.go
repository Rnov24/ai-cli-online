package tmux

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	SocketPath string
	validIdRe  = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,32}$`)
)

func init() {
	home, _ := os.UserHomeDir()
	if home == "" {
		home = "/root"
	}
	dir := filepath.Join(home, ".tmux-sockets")
	_ = os.MkdirAll(dir, 0700)
	SocketPath = filepath.Join(dir, "ai-cli-online")
}

type SessionInfo struct {
	SessionName string `json:"sessionName"`
	SessionId   string `json:"sessionId"`
	CreatedAt   int64  `json:"createdAt"`
	Connected   bool   `json:"connected"`
	Cwd         string `json:"cwd,omitempty"`
	Command     string `json:"command,omitempty"`
}

func Exec(ctx context.Context, args ...string) (string, error) {
	tmuxArgs := append([]string{"-S", SocketPath}, args...)
	cmd := exec.CommandContext(ctx, "tmux", tmuxArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func ExecTimeout(timeout time.Duration, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return Exec(ctx, args...)
}

func TokenToSessionName(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("ai-cli-online-%s", hex.EncodeToString(h[:])[:8])
}

func IsValidSessionId(id string) bool {
	return validIdRe.MatchString(id)
}

func BuildSessionName(token, sessionId string) string {
	base := TokenToSessionName(token)
	if sessionId != "" {
		return fmt.Sprintf("%s-%s", base, sessionId)
	}
	return base
}

func HasSession(name string) bool {
	_, err := ExecTimeout(3*time.Second, "has-session", "-t", "="+name)
	return err == nil
}

func ConfigureSession(name string) {
	// set-option does not support = prefix, so use bare name
	_, _ = ExecTimeout(3*time.Second,
		"set-option", "-t", name, "history-limit", "50000", ";",
		"set-option", "-t", name, "status", "off", ";",
		"set-option", "-t", name, "mouse", "off",
	)
}

func CreateSession(name string, cols, rows int, cwd, startCmd string) error {
	args := []string{
		"new-session",
		"-d",
		"-s", name,
		"-x", strconv.Itoa(cols),
		"-y", strconv.Itoa(rows),
	}
	if startCmd != "" {
		args = append(args, startCmd)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tmuxArgs := append([]string{"-S", SocketPath}, args...)
	cmd := exec.CommandContext(ctx, "tmux", tmuxArgs...)
	if cwd != "" {
		cmd.Dir = cwd
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("create session failed: %w (%s)", err, stderr.String())
	}

	ConfigureSession(name)
	log.Printf("[tmux] Created session: %s (%dx%d) in %s", name, cols, rows, cwd)
	return nil
}

func CaptureScrollback(name string) string {
	out, err := ExecTimeout(5*time.Second,
		"capture-pane",
		"-t", "="+name+":",
		"-p",
		"-e",
		"-S", "-10000",
	)
	if err != nil {
		return ""
	}
	return out
}

func ResizeSession(name string, cols, rows int) {
	_, _ = ExecTimeout(2*time.Second,
		"resize-window",
		"-t", "="+name,
		"-x", strconv.Itoa(cols),
		"-y", strconv.Itoa(rows),
	)
}

func KillSession(name string) error {
	_, err := ExecTimeout(3*time.Second, "kill-session", "-t", "="+name)
	return err
}

func ListSessions(token string) ([]SessionInfo, error) {
	prefix := ""
	if token != "" {
		prefix = TokenToSessionName(token) + "-"
	}

	out, err := ExecTimeout(4*time.Second, "list-sessions", "-F", "#{session_name}:#{session_created}")
	if err != nil {
		return []SessionInfo{}, nil
	}

	var results []SessionInfo
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lastColon := strings.LastIndex(line, ":")
		if lastColon == -1 {
			continue
		}
		sName := line[:lastColon]
		created, _ := strconv.ParseInt(line[lastColon+1:], 10, 64)

		if prefix != "" && !strings.HasPrefix(sName, prefix) {
			continue
		}

		sId := sName
		if prefix != "" {
			sId = strings.TrimPrefix(sName, prefix)
		}
		results = append(results, SessionInfo{
			SessionName: sName,
			SessionId:   sId,
			CreatedAt:   created,
		})
	}
	return results, nil
}

func GetCwd(name, defaultCwd string) string {
	out, err := ExecTimeout(2*time.Second, "list-panes", "-t", "="+name, "-F", "#{pane_current_path}")
	if err != nil {
		return defaultCwd
	}
	cwd := strings.TrimSpace(out)
	cwd = strings.TrimSuffix(cwd, " (deleted)")
	if cwd == "" {
		return defaultCwd
	}
	if _, err := os.Stat(cwd); err != nil {
		return defaultCwd
	}
	return cwd
}

func GetPaneCommand(name string) string {
	out, err := ExecTimeout(2*time.Second, "list-panes", "-t", "="+name, "-F", "#{pane_current_command}")
	if err != nil {
		return ""
	}
	cmd := strings.TrimSpace(out)
	if strings.HasPrefix(cmd, "agy") {
		return "agy"
	}
	return cmd
}

func IsTmuxAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

func IsAgyAvailable() bool {
	_, err := exec.LookPath("agy")
	return err == nil
}
