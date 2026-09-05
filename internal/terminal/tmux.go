package terminal

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
)

var (
	SocketPath string
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
	log.Printf("[terminal] Created tmux session: %s (%dx%d) in %s", name, cols, rows, cwd)
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

func KillTmuxSession(name string) error {
	_, err := ExecTimeout(3*time.Second, "kill-session", "-t", "="+name)
	return err
}

func SendTmuxKeys(name string, keys ...string) error {
	args := append([]string{"send-keys", "-t", "=" + name}, keys...)
	_, err := ExecTimeout(3*time.Second, args...)
	return err
}

func ListTmuxSessions(token string) ([]SessionInfo, error) {
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

func GetTmuxCwd(name, defaultCwd string) string {
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

func GetTmuxPaneCommand(name string) string {
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

type tmuxSession struct {
	mu          sync.Mutex
	sessionName string
	ptmx        *os.File
	cmd         *exec.Cmd
	closed      bool
}

func attachTmux(sessionName string, cols, rows int) (*tmuxSession, error) {
	c := exec.Command("tmux", "-S", SocketPath, "attach-session", "-t", "="+sessionName)
	c.Env = sanitizedEnv()

	ptmx, err := pty.StartWithSize(c, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to attach pty: %w", err)
	}

	return &tmuxSession{
		sessionName: sessionName,
		ptmx:        ptmx,
		cmd:         c,
	}, nil
}

func (s *tmuxSession) SessionName() string {
	return s.sessionName
}

func (s *tmuxSession) Mode() string {
	return "tmux"
}

func (s *tmuxSession) Read(p []byte) (int, error) {
	return s.ptmx.Read(p)
}

func (s *tmuxSession) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return 0, os.ErrClosed
	}
	return s.ptmx.Write(p)
}

func (s *tmuxSession) Resize(cols, rows int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return os.ErrClosed
	}
	ResizeSession(s.sessionName, cols, rows)
	return pty.Setsize(s.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (s *tmuxSession) Scrollback() string {
	return CaptureScrollback(s.sessionName)
}

func (s *tmuxSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	_ = s.ptmx.Close()
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	return nil
}

func (s *tmuxSession) IsAlive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.closed
}
