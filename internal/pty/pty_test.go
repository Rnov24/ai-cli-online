package pty

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestResolveDefaultShell(t *testing.T) {
	shell := resolveDefaultShell()
	if shell == "" {
		t.Fatal("expected non-empty shell path")
	}
	if _, err := exec.LookPath(shell); err != nil {
		t.Fatalf("resolved shell %q not found in PATH: %v", shell, err)
	}

	// Test fallback when SHELL is set to something non-existent
	origShell := os.Getenv("SHELL")
	defer os.Setenv("SHELL", origShell)

	os.Setenv("SHELL", "/nonexistent/path/to/shell")
	fallback := resolveDefaultShell()
	if fallback == "/nonexistent/path/to/shell" {
		t.Errorf("expected fallback when SHELL does not exist, got %q", fallback)
	}
	if _, err := exec.LookPath(fallback); err != nil {
		t.Errorf("fallback shell %q not executable: %v", fallback, err)
	}
}

func TestStartDirect(t *testing.T) {
	cwd := t.TempDir()
	sess, err := StartDirect(cwd, 80, 24, "")
	if err != nil {
		t.Fatalf("StartDirect failed: %v", err)
	}
	defer sess.Close()

	if !sess.IsAlive() {
		t.Fatal("expected session to be alive")
	}

	// Test writing input to shell
	_, err = sess.Write([]byte("echo PTY_TEST_ECHO\n"))
	if err != nil {
		t.Fatalf("sess.Write failed: %v", err)
	}

	// Test reading output from shell
	readCh := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		buf := make([]byte, 1024)
		var output bytes.Buffer
		for {
			n, err := sess.Read(buf)
			if n > 0 {
				output.Write(buf[:n])
				if strings.Contains(output.String(), "PTY_TEST_ECHO") {
					readCh <- output.String()
					return
				}
			}
			if err != nil {
				errCh <- err
				return
			}
		}
	}()

	select {
	case out := <-readCh:
		if !strings.Contains(out, "PTY_TEST_ECHO") {
			t.Fatalf("expected PTY_TEST_ECHO in output, got: %q", out)
		}
	case err := <-errCh:
		t.Fatalf("reading from pty failed: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for shell output")
	}

	// Test resize
	if err := sess.Resize(100, 30); err != nil {
		t.Fatalf("sess.Resize failed: %v", err)
	}

	// Test close
	if err := sess.Close(); err != nil {
		t.Fatalf("sess.Close failed: %v", err)
	}

	if !sess.closed || sess.IsAlive() {
		t.Fatal("expected session to not be alive after close")
	}

	// Calling Close again should be idempotent
	if err := sess.Close(); err != nil {
		t.Fatalf("second sess.Close returned error: %v", err)
	}

	// Write after close should return os.ErrClosed
	if _, err := sess.Write([]byte("test")); err != os.ErrClosed {
		t.Fatalf("expected os.ErrClosed on write after close, got: %v", err)
	}

	// Resize after close should return os.ErrClosed
	if err := sess.Resize(80, 24); err != os.ErrClosed {
		t.Fatalf("expected os.ErrClosed on resize after close, got: %v", err)
	}
}

func TestStartDirectWithCustomCommand(t *testing.T) {
	cwd := t.TempDir()
	sess, err := StartDirect(cwd, 80, 24, "echo DIRECT_CUSTOM_CMD")
	if err != nil {
		t.Fatalf("StartDirect with customCmd failed: %v", err)
	}
	defer sess.Close()

	buf := make([]byte, 512)
	var output bytes.Buffer
	done := make(chan bool)
	go func() {
		for {
			n, err := sess.Read(buf)
			if n > 0 {
				output.Write(buf[:n])
				if strings.Contains(output.String(), "DIRECT_CUSTOM_CMD") {
					done <- true
					return
				}
			}
			if err != nil {
				done <- true
				return
			}
		}
	}()

	select {
	case <-done:
		if !strings.Contains(output.String(), "DIRECT_CUSTOM_CMD") {
			t.Fatalf("expected DIRECT_CUSTOM_CMD in output, got: %q", output.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for custom command output")
	}
}
