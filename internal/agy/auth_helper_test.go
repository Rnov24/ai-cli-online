package agy

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAuthFlowWithMockAgy(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping shell mock on Windows")
	}
	cliDir := setupTestCliDir(t)
	_ = cliDir

	// Create a mock agy script
	mockDir := t.TempDir()
	mockAgy := filepath.Join(mockDir, "mock-agy.sh")
	script := `#!/bin/sh
echo "Authentication required. Please visit the URL to log in:"
echo "  https://accounts.google.com/o/oauth2/auth?client_id=123&scope=cloud-platform"
echo "Or, paste the authorization code here and press Enter:"
read CODE
if [ "$CODE" = "valid-code" ]; then
  mkdir -p "$HOME/.gemini/antigravity-cli"
  echo '{"token":{"access_token":"ya29.mock-token"}}' > "$HOME/.gemini/antigravity-cli/antigravity-oauth-token"
  exit 0
else
  exit 1
fi
`
	if err := os.WriteFile(mockAgy, []byte(script), 0755); err != nil {
		t.Fatalf("failed to write mock agy: %v", err)
	}

	CustomAgyBin = mockAgy
	defer func() {
		CustomAgyBin = ""
	}()

	// 1. Start flow
	resp, err := StartAuthFlow("team-alpha")
	if err != nil {
		t.Fatalf("StartAuthFlow failed: %v", err)
	}
	if resp.FlowID == "" {
		t.Fatalf("expected FlowID, got empty")
	}
	if resp.AuthURL != "https://accounts.google.com/o/oauth2/auth?client_id=123&scope=cloud-platform" {
		t.Fatalf("unexpected AuthURL: %s", resp.AuthURL)
	}

	// 2. Submit valid code
	if err := SubmitAuthCode(resp.FlowID, "team-alpha", "valid-code"); err != nil {
		t.Fatalf("SubmitAuthCode failed: %v", err)
	}

	// 3. Verify profile team-alpha is now active
	if GetCurrentProfile() != "team-alpha" {
		t.Fatalf("expected current profile 'team-alpha', got %q", GetCurrentProfile())
	}

	activeToken, err := os.ReadFile(getActiveTokenPath())
	if err != nil {
		t.Fatalf("failed to read active token: %v", err)
	}
	if string(activeToken) != `{"token":{"access_token":"ya29.mock-token"}}`+"\n" {
		t.Fatalf("unexpected active token content: %s", string(activeToken))
	}
}

func TestCancelAuthFlow(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping shell mock on Windows")
	}
	mockDir := t.TempDir()
	mockAgy := filepath.Join(mockDir, "mock-agy-sleep.sh")
	script := `#!/bin/sh
echo "Authentication required. Please visit the URL to log in:"
echo "  https://accounts.google.com/o/oauth2/auth?client_id=test"
sleep 10
`
	_ = os.WriteFile(mockAgy, []byte(script), 0755)

	CustomAgyBin = mockAgy
	defer func() {
		CustomAgyBin = ""
	}()

	resp, err := StartAuthFlow("cancelled-test")
	if err != nil {
		t.Fatalf("StartAuthFlow failed: %v", err)
	}

	CancelAuthFlow(resp.FlowID)

	// Submitting code should fail now
	err = SubmitAuthCode(resp.FlowID, "cancelled-test", "any-code")
	if err == nil {
		t.Fatalf("expected error submitting code to cancelled flow, got nil")
	}
}

func TestStartAuthFlowWithRealAgy(t *testing.T) {
	if os.Getenv("AGY_TEST_LIVE_AUTH") != "1" {
		t.Skip("skipping live agy auth test without AGY_TEST_LIVE_AUTH=1")
	}
	bin := ResolveAgyBinary()
	if bin == "" || bin == "agy" {
		t.Skip("real agy binary not available")
	}

	resp, err := StartAuthFlow("test-live-profile")
	if err != nil {
		t.Fatalf("StartAuthFlow failed: %v", err)
	}
	defer func() {
		if resp.FlowID != "" {
			CancelAuthFlow(resp.FlowID)
		}
	}()

	if resp.AuthURL == "" {
		t.Fatalf("expected non-empty AuthURL, got empty; Message=%q", resp.Message)
	}

	if resp.FlowID == "" {
		t.Fatalf("expected non-empty FlowID")
	}
}

