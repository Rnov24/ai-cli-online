package tunnel

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetDownloadUrl(t *testing.T) {
	url, err := GetDownloadUrl()
	if err != nil {
		t.Fatalf("GetDownloadUrl failed: %v", err)
	}
	if url == "" {
		t.Fatal("expected non-empty download URL")
	}
	if !filepath.IsAbs(url) && len(url) < 10 {
		t.Fatalf("unexpected download URL shape: %s", url)
	}
}

func TestManager_FindBinary_CustomDir(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "tunnel-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	fakeBin := filepath.Join(tempDir, "cloudflared")
	if err := os.WriteFile(fakeBin, []byte("#!/bin/sh\necho cloudflared version 2026.1.0\n"), 0755); err != nil {
		t.Fatalf("failed to write fake binary: %v", err)
	}

	mgr := NewManager(tempDir)
	bin, found := mgr.FindBinary()
	if !found {
		t.Fatalf("expected binary to be found in %s", tempDir)
	}
	if bin != fakeBin {
		t.Fatalf("expected %s, got %s", fakeBin, bin)
	}

	status := mgr.Status()
	if !status.Installed {
		t.Fatalf("expected status.Installed to be true")
	}
}

func TestManager_AppendLog_TryCloudflare(t *testing.T) {
	mgr := NewManager()
	mgr.status.Mode = "quick"

	testLine := "2026-09-09T22:00:00Z INF +--------------------------------------------------------------------------------------------+"
	mgr.appendLog(testLine)
	urlLine := "2026-09-09T22:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |"
	mgr.appendLog(urlLine)
	tunnelLine := "2026-09-09T22:00:02Z INF |  https://bold-robot-antenna.trycloudflare.com                                                  |"
	mgr.appendLog(tunnelLine)

	status := mgr.Status()
	if status.Url != "https://bold-robot-antenna.trycloudflare.com" {
		t.Fatalf("expected URL to be parsed, got %s", status.Url)
	}
	if !status.Running {
		t.Fatalf("expected status.Running to be true once URL found")
	}
	if len(status.Logs) != 3 {
		t.Fatalf("expected 3 log lines, got %d", len(status.Logs))
	}
}

func TestManager_Stop_Idempotent(t *testing.T) {
	mgr := NewManager()
	if err := mgr.Stop(); err != nil {
		t.Fatalf("Stop on idle manager should not return error: %v", err)
	}
	st := mgr.Status()
	if st.Running {
		t.Fatal("expected status.Running to be false")
	}
}
