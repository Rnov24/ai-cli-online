package agy

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestCliDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	CustomCliDir = dir
	t.Cleanup(func() {
		CustomCliDir = ""
	})
	return dir
}

func TestEnsureDefaultProfile(t *testing.T) {
	dir := setupTestCliDir(t)
	tokenFile := filepath.Join(dir, "antigravity-oauth-token")
	err := os.WriteFile(tokenFile, []byte(`{"token":{"access_token":"default-test"}}`), 0600)
	if err != nil {
		t.Fatalf("failed to write token: %v", err)
	}

	EnsureDefaultProfile()

	activeFile := filepath.Join(dir, "profiles", ".active")
	activeData, err := os.ReadFile(activeFile)
	if err != nil {
		t.Fatalf("expected .active to exist: %v", err)
	}
	if string(activeData) != "default\n" {
		t.Fatalf("expected active profile default, got %q", string(activeData))
	}

	defaultToken := filepath.Join(dir, "profiles", "default", "antigravity-oauth-token")
	if _, err := os.Stat(defaultToken); os.IsNotExist(err) {
		t.Fatalf("expected default token to be copied: %v", err)
	}
}

func TestListProfiles(t *testing.T) {
	dir := setupTestCliDir(t)
	tokenFile := filepath.Join(dir, "antigravity-oauth-token")
	_ = os.WriteFile(tokenFile, []byte(`{"token":{"access_token":"tok-default"}}`), 0600)

	resp, err := ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles failed: %v", err)
	}
	if resp.Current != "default" {
		t.Fatalf("expected current 'default', got %q", resp.Current)
	}
	if len(resp.Profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(resp.Profiles))
	}
	if !resp.Profiles[0].IsActive || resp.Profiles[0].Name != "default" {
		t.Fatalf("expected active default profile, got %+v", resp.Profiles[0])
	}
}

func TestSaveAndSwitchProfile(t *testing.T) {
	dir := setupTestCliDir(t)
	tokenFile := filepath.Join(dir, "antigravity-oauth-token")
	_ = os.WriteFile(tokenFile, []byte(`{"token":{"access_token":"tok-default"}}`), 0600)

	// Save current profile as "personal"
	if err := SaveCurrentProfile("personal"); err != nil {
		t.Fatalf("SaveCurrentProfile failed: %v", err)
	}

	if GetCurrentProfile() != "personal" {
		t.Fatalf("expected current profile 'personal', got %q", GetCurrentProfile())
	}

	// Create another profile "work" via ImportProfile
	if err := ImportProfile("work", `{"token":{"access_token":"tok-work"}}`); err != nil {
		t.Fatalf("ImportProfile failed: %v", err)
	}

	// Import makes "work" active
	if GetCurrentProfile() != "work" {
		t.Fatalf("expected current profile 'work', got %q", GetCurrentProfile())
	}

	// Switch back to "personal"
	if err := SwitchProfile("personal"); err != nil {
		t.Fatalf("SwitchProfile failed: %v", err)
	}
	if GetCurrentProfile() != "personal" {
		t.Fatalf("expected current profile 'personal' after switch, got %q", GetCurrentProfile())
	}

	curToken, _ := os.ReadFile(tokenFile)
	if string(curToken) != `{"token":{"access_token":"tok-default"}}` {
		t.Fatalf("unexpected active token content: %s", string(curToken))
	}
}

func TestRenameAndDeleteProfile(t *testing.T) {
	dir := setupTestCliDir(t)
	tokenFile := filepath.Join(dir, "antigravity-oauth-token")
	_ = os.WriteFile(tokenFile, []byte(`{"token":{"access_token":"tok-1"}}`), 0600)

	_ = SaveCurrentProfile("profile1")
	_ = ImportProfile("profile2", `{"token":{"access_token":"tok-2"}}`)

	// Cannot delete active profile (profile2 is active)
	if err := DeleteProfile("profile2"); err == nil {
		t.Fatalf("expected error deleting active profile, got nil")
	}

	// Switch to profile1, then delete profile2
	if err := SwitchProfile("profile1"); err != nil {
		t.Fatalf("switch failed: %v", err)
	}
	if err := DeleteProfile("profile2"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// Rename profile1 to profile-renamed
	if err := RenameProfile("profile1", "profile-renamed"); err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	if GetCurrentProfile() != "profile-renamed" {
		t.Fatalf("expected active profile 'profile-renamed', got %q", GetCurrentProfile())
	}
}

func TestNormalizeTokenContent(t *testing.T) {
	rawAccess := "ya29.a0AdMD6EgeWtXODMX1P1234567890abcdef"
	norm := normalizeTokenContent(rawAccess)
	if norm != `{"token":{"access_token":"ya29.a0AdMD6EgeWtXODMX1P1234567890abcdef","token_type":"Bearer"},"auth_method":"consumer"}` {
		t.Fatalf("unexpected normalized token: %s", norm)
	}

	partialJson := `{"access_token":"ya29.xyz"}`
	norm2 := normalizeTokenContent(partialJson)
	if norm2 != `{"token":{"access_token":"ya29.xyz"},"auth_method":"consumer"}` {
		t.Fatalf("unexpected normalized partial json: %s", norm2)
	}
}
