package pty

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/creack/pty"
	"github.com/huacheng/ai-cli-online/internal/tmux"
)

var sensitiveKeys = []string{"AUTH_TOKEN", "SECRET", "PASSWORD", "API_KEY", "PRIVATE_KEY", "ACCESS_TOKEN"}

func sanitizedEnv() []string {
	var env []string
	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) == 0 {
			continue
		}
		upper := strings.ToUpper(parts[0])
		sensitive := false
		for _, s := range sensitiveKeys {
			if strings.Contains(upper, s) {
				sensitive = true
				break
			}
		}
		if !sensitive {
			env = append(env, e)
		}
	}
	env = append(env, "TERM=xterm-256color")
	return env
}

type Session struct {
	mu     sync.Mutex
	ptmx   *os.File
	cmd    *exec.Cmd
	closed bool
}

func Start(sessionName string, cols, rows int) (*Session, error) {
	c := exec.Command("tmux", "-S", tmux.SocketPath, "attach-session", "-t", "="+sessionName)
	c.Env = sanitizedEnv()

	ptmx, err := pty.StartWithSize(c, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to attach pty: %w", err)
	}

	return &Session{
		ptmx: ptmx,
		cmd:  c,
	}, nil
}

func resolveDefaultShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		if _, err := exec.LookPath(shell); err == nil {
			return shell
		}
	}
	for _, candidate := range []string{"/system/bin/sh", "/bin/bash", "/bin/sh", "sh"} {
		if p, err := exec.LookPath(candidate); err == nil {
			return p
		}
	}
	return "sh"
}

func StartDirect(cwd string, cols, rows int, customCmd string) (*Session, error) {
	shell := resolveDefaultShell()
	var c *exec.Cmd
	if customCmd != "" {
		c = exec.Command(shell, "-c", customCmd)
	} else {
		c = exec.Command(shell)
	}
	if cwd != "" {
		c.Dir = cwd
	}
	c.Env = sanitizedEnv()

	ptmx, err := pty.StartWithSize(c, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start direct pty: %w", err)
	}

	return &Session{
		ptmx: ptmx,
		cmd:  c,
	}, nil
}

func (s *Session) Read(p []byte) (int, error) {
	return s.ptmx.Read(p)
}

func (s *Session) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return 0, os.ErrClosed
	}
	return s.ptmx.Write(p)
}

func (s *Session) Resize(cols, rows int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return os.ErrClosed
	}
	return pty.Setsize(s.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (s *Session) Close() error {
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

func (s *Session) IsAlive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.closed
}
