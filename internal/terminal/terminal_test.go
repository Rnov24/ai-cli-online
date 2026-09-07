package terminal

import (
	"bytes"
	"errors"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/creack/pty"
)

func TestSessionNameHelpers(t *testing.T) {
	token := "my-secret-token"
	sessName := TokenToSessionName(token)
	if sessName == "" || len(sessName) < 10 {
		t.Fatalf("unexpected token session name: %s", sessName)
	}

	full := BuildSessionName(token, "term-1")
	expected := sessName + "-term-1"
	if full != expected {
		t.Fatalf("expected %s, got %s", expected, full)
	}

	if !IsValidSessionId("default") {
		t.Errorf("'default' should be valid")
	}
	if !IsValidSessionId("term_123-abc") {
		t.Errorf("'term_123-abc' should be valid")
	}
	if IsValidSessionId("invalid/slash") {
		t.Errorf("'invalid/slash' should be invalid")
	}
	if IsValidSessionId("this_session_id_is_way_too_long_and_exceeds_32_characters") {
		t.Errorf("overly long session id should be invalid")
	}
}

func TestSanitizedEnv(t *testing.T) {
	orig := os.Getenv("AUTH_TOKEN")
	_ = os.Setenv("AUTH_TOKEN", "sensitive-val")
	defer func() {
		if orig != "" {
			_ = os.Setenv("AUTH_TOKEN", orig)
		} else {
			_ = os.Unsetenv("AUTH_TOKEN")
		}
	}()

	env := sanitizedEnv()
	for _, e := range env {
		if strings.HasPrefix(e, "AUTH_TOKEN=") {
			t.Errorf("AUTH_TOKEN leaked in sanitizedEnv: %s", e)
		}
	}

	foundTerm := false
	for _, e := range env {
		if e == "TERM=xterm-256color" {
			foundTerm = true
			break
		}
	}
	if !foundTerm {
		t.Errorf("expected TERM=xterm-256color in sanitizedEnv")
	}
}

func TestDirectSessionLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	sessName := "test-direct-session-1"

	sess, err := startDirect(sessName, tempDir, 80, 24, "")
	if err != nil {
		if errors.Is(err, pty.ErrUnsupported) || runtime.GOOS == "windows" {
			t.Skipf("skipping direct pty test on unsupported platform (%s): %v", runtime.GOOS, err)
		}
		t.Fatalf("startDirect failed: %v", err)
	}
	defer sess.Close()

	if sess.Mode() != "direct" {
		t.Errorf("expected mode direct, got %s", sess.Mode())
	}
	if sess.SessionName() != sessName {
		t.Errorf("expected session name %s, got %s", sessName, sess.SessionName())
	}
	if !sess.IsAlive() {
		t.Errorf("expected session to be alive")
	}

	// Verify registry lookup
	cwd := GetCwd(sessName, "/default")
	if cwd != tempDir {
		t.Errorf("expected cwd %s, got %s", tempDir, cwd)
	}

	// Test writing and reading
	_, err = sess.Write([]byte("echo HELLO_DIRECT_TERMINAL\n"))
	if err != nil {
		t.Fatalf("write failed: %v", err)
	}

	readCh := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		buf := make([]byte, 1024)
		var output bytes.Buffer
		for {
			n, rErr := sess.Read(buf)
			if n > 0 {
				output.Write(buf[:n])
				if strings.Contains(output.String(), "HELLO_DIRECT_TERMINAL") {
					readCh <- output.String()
					return
				}
			}
			if rErr != nil {
				errCh <- rErr
				return
			}
		}
	}()

	select {
	case out := <-readCh:
		if !strings.Contains(out, "HELLO_DIRECT_TERMINAL") {
			t.Fatalf("expected HELLO_DIRECT_TERMINAL in output, got: %s", out)
		}
	case err := <-errCh:
		t.Fatalf("reading failed: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for shell output")
	}

	// Test scrollback capture
	scroll := sess.Scrollback()
	if !strings.Contains(scroll, "HELLO_DIRECT_TERMINAL") {
		t.Errorf("expected scrollback to contain output, got: %s", scroll)
	}

	// Test resize
	if err := sess.Resize(100, 30); err != nil {
		t.Errorf("resize failed: %v", err)
	}

	// Test close
	if err := sess.Close(); err != nil {
		t.Errorf("close failed: %v", err)
	}
	if sess.IsAlive() {
		t.Errorf("expected session to not be alive after close")
	}

	// Double close should be safe
	if err := sess.Close(); err != nil {
		t.Errorf("second close should be idempotent: %v", err)
	}
}

func TestListSessionsWithDirectRegistry(t *testing.T) {
	tempDir := t.TempDir()
	token := "user-token"
	prefix := TokenToSessionName(token)
	sessName := prefix + "-tab1"

	sess, err := startDirect(sessName, tempDir, 80, 24, "")
	if err != nil {
		if errors.Is(err, pty.ErrUnsupported) || runtime.GOOS == "windows" {
			t.Skipf("skipping direct pty test on unsupported platform (%s): %v", runtime.GOOS, err)
		}
		t.Fatalf("startDirect failed: %v", err)
	}
	defer sess.Close()

	activeMap := map[string]bool{
		sessName: true,
	}

	// When tmux is not available, or directly checking list
	sessions, err := List(token, activeMap, "/fallback")
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}

	found := false
	for _, s := range sessions {
		if s.SessionName == sessName {
			found = true
			if !s.Connected {
				t.Errorf("expected Connected=true")
			}
			break
		}
	}

	// If tmux is available, it lists tmux sessions; if not, it lists from registry
	if !IsTmuxAvailable() && !found {
		t.Errorf("expected direct session %s in list output", sessName)
	}
}

func TestDirectSessionScrollbackOverflow(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe failed: %v", err)
	}
	defer r.Close()

	s := &directSession{
		sessionName: "test-overflow",
		ptmx:        r,
	}

	total := maxScrollbackBytes + 1024
	payload := make([]byte, total)
	for i := range payload {
		payload[i] = byte('A' + (i % 26))
	}

	go func() {
		defer w.Close()
		_, _ = w.Write(payload)
	}()

	buf := make([]byte, 4096)
	for {
		n, err := s.Read(buf)
		if n == 0 || err != nil {
			break
		}
	}

	scroll := s.Scrollback()
	if len(scroll) != maxScrollbackBytes {
		t.Fatalf("expected scrollback length %d, got %d", maxScrollbackBytes, len(scroll))
	}

	expectedTail := string(payload[total-maxScrollbackBytes:])
	if scroll != expectedTail {
		t.Errorf("scrollback content mismatch with expected tail")
	}
}
