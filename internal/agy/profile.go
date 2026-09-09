package agy

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	// CustomCliDir allows overriding ~/.gemini/antigravity-cli for testing
	CustomCliDir string
	profileMu    sync.Mutex
	validNameRe  = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
)

type ProfileInfo struct {
	Name      string `json:"name"`
	IsActive  bool   `json:"isActive"`
	UpdatedAt int64  `json:"updatedAt"`
	HasToken  bool   `json:"hasToken"`
}

type ProfilesResponse struct {
	Current  string        `json:"current"`
	Profiles []ProfileInfo `json:"profiles"`
}

func getCliDir() string {
	if CustomCliDir != "" {
		return CustomCliDir
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "/root"
	}
	return filepath.Join(home, ".gemini", "antigravity-cli")
}

func getProfilesDir() string {
	return filepath.Join(getCliDir(), "profiles")
}

func getActiveTokenPath() string {
	return filepath.Join(getCliDir(), "antigravity-oauth-token")
}

func getActiveFilePath() string {
	return filepath.Join(getProfilesDir(), ".active")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func GetCurrentProfile() string {
	activeFile := getActiveFilePath()
	data, err := os.ReadFile(activeFile)
	if err == nil {
		name := strings.TrimSpace(string(data))
		if name != "" {
			return name
		}
	}
	return "default"
}

func EnsureDefaultProfile() {
	tokenPath := getActiveTokenPath()
	activeFile := getActiveFilePath()
	profilesDir := getProfilesDir()

	if _, err := os.Stat(activeFile); os.IsNotExist(err) {
		if _, err := os.Stat(tokenPath); err == nil {
			_ = os.MkdirAll(filepath.Join(profilesDir, "default"), 0700)
			defaultToken := filepath.Join(profilesDir, "default", "antigravity-oauth-token")
			_ = copyFile(tokenPath, defaultToken)
			_ = os.WriteFile(activeFile, []byte("default\n"), 0600)
		}
	}
}

func SyncActiveToken() {
	cur := GetCurrentProfile()
	if cur == "" {
		return
	}
	tokenPath := getActiveTokenPath()
	targetPath := filepath.Join(getProfilesDir(), cur, "antigravity-oauth-token")

	tokenStat, err1 := os.Stat(tokenPath)
	targetStat, err2 := os.Stat(targetPath)

	if err1 == nil && (err2 != nil || tokenStat.ModTime().After(targetStat.ModTime())) {
		_ = copyFile(tokenPath, targetPath)
	}
}

func ListProfiles() (*ProfilesResponse, error) {
	profileMu.Lock()
	defer profileMu.Unlock()

	EnsureDefaultProfile()
	SyncActiveToken()

	profilesDir := getProfilesDir()
	_ = os.MkdirAll(profilesDir, 0700)

	current := GetCurrentProfile()

	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read profiles directory: %w", err)
	}

	var profiles []ProfileInfo
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		name := entry.Name()
		tokenPath := filepath.Join(profilesDir, name, "antigravity-oauth-token")
		hasToken := false
		var updatedAt int64

		if info, err := os.Stat(tokenPath); err == nil {
			hasToken = true
			updatedAt = info.ModTime().UnixMilli()
		} else if dInfo, err := entry.Info(); err == nil {
			updatedAt = dInfo.ModTime().UnixMilli()
		} else {
			updatedAt = time.Now().UnixMilli()
		}

		profiles = append(profiles, ProfileInfo{
			Name:      name,
			IsActive:  (name == current),
			UpdatedAt: updatedAt,
			HasToken:  hasToken,
		})
	}

	// If no profiles directory exists but token exists, ensure default is shown
	if len(profiles) == 0 {
		hasToken := false
		var updatedAt int64
		if info, err := os.Stat(getActiveTokenPath()); err == nil {
			hasToken = true
			updatedAt = info.ModTime().UnixMilli()
		}
		profiles = append(profiles, ProfileInfo{
			Name:      "default",
			IsActive:  true,
			UpdatedAt: updatedAt,
			HasToken:  hasToken,
		})
		current = "default"
	}

	// Sort: active first, then alphabetical
	sort.Slice(profiles, func(i, j int) bool {
		if profiles[i].IsActive != profiles[j].IsActive {
			return profiles[i].IsActive
		}
		return profiles[i].Name < profiles[j].Name
	})

	return &ProfilesResponse{
		Current:  current,
		Profiles: profiles,
	}, nil
}

func SwitchProfile(name string) error {
	profileMu.Lock()
	defer profileMu.Unlock()

	name = strings.TrimSpace(name)
	if !validNameRe.MatchString(name) {
		return fmt.Errorf("invalid profile name: %s", name)
	}

	targetToken := filepath.Join(getProfilesDir(), name, "antigravity-oauth-token")
	if _, err := os.Stat(targetToken); os.IsNotExist(err) {
		return fmt.Errorf("profile %q does not exist or has no token", name)
	}

	SyncActiveToken()

	activeToken := getActiveTokenPath()
	if err := copyFile(targetToken, activeToken); err != nil {
		return fmt.Errorf("failed to copy profile token to active path: %w", err)
	}

	activeFile := getActiveFilePath()
	if err := os.WriteFile(activeFile, []byte(name+"\n"), 0600); err != nil {
		return fmt.Errorf("failed to update active profile file: %w", err)
	}

	return nil
}

func SaveCurrentProfile(name string) error {
	profileMu.Lock()
	defer profileMu.Unlock()

	name = strings.TrimSpace(name)
	if !validNameRe.MatchString(name) {
		return fmt.Errorf("invalid profile name: %s", name)
	}

	activeToken := getActiveTokenPath()
	if _, err := os.Stat(activeToken); os.IsNotExist(err) {
		return errors.New("no active Antigravity OAuth token found to save")
	}

	targetDir := filepath.Join(getProfilesDir(), name)
	if err := os.MkdirAll(targetDir, 0700); err != nil {
		return fmt.Errorf("failed to create profile directory: %w", err)
	}

	targetToken := filepath.Join(targetDir, "antigravity-oauth-token")
	if err := copyFile(activeToken, targetToken); err != nil {
		return fmt.Errorf("failed to save profile token: %w", err)
	}

	activeFile := getActiveFilePath()
	if err := os.WriteFile(activeFile, []byte(name+"\n"), 0600); err != nil {
		return fmt.Errorf("failed to update active profile file: %w", err)
	}

	return nil
}

func normalizeTokenContent(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "{") && strings.HasSuffix(raw, "}") {
		if !strings.Contains(raw, `"token"`) && strings.Contains(raw, `"access_token"`) {
			return fmt.Sprintf(`{"token":%s,"auth_method":"consumer"}`, raw)
		}
		return raw
	}
	if strings.HasPrefix(raw, "ya29.") || len(raw) > 20 {
		return fmt.Sprintf(`{"token":{"access_token":%q,"token_type":"Bearer"},"auth_method":"consumer"}`, raw)
	}
	return raw
}

func ImportProfile(name, tokenContent string) error {
	profileMu.Lock()
	defer profileMu.Unlock()

	name = strings.TrimSpace(name)
	if !validNameRe.MatchString(name) {
		return fmt.Errorf("invalid profile name: %s", name)
	}

	tokenContent = strings.TrimSpace(tokenContent)
	if tokenContent == "" {
		return errors.New("token content cannot be empty")
	}
	tokenContent = normalizeTokenContent(tokenContent)

	targetDir := filepath.Join(getProfilesDir(), name)
	if err := os.MkdirAll(targetDir, 0700); err != nil {
		return fmt.Errorf("failed to create profile directory: %w", err)
	}

	targetToken := filepath.Join(targetDir, "antigravity-oauth-token")
	if err := os.WriteFile(targetToken, []byte(tokenContent+"\n"), 0600); err != nil {
		return fmt.Errorf("failed to write profile token: %w", err)
	}

	// Make active
	activeToken := getActiveTokenPath()
	if err := copyFile(targetToken, activeToken); err != nil {
		return fmt.Errorf("failed to activate profile token: %w", err)
	}

	activeFile := getActiveFilePath()
	if err := os.WriteFile(activeFile, []byte(name+"\n"), 0600); err != nil {
		return fmt.Errorf("failed to update active profile file: %w", err)
	}

	return nil
}

func DeleteProfile(name string) error {
	profileMu.Lock()
	defer profileMu.Unlock()

	name = strings.TrimSpace(name)
	if !validNameRe.MatchString(name) {
		return fmt.Errorf("invalid profile name: %s", name)
	}

	cur := GetCurrentProfile()
	if name == cur {
		return fmt.Errorf("cannot delete currently active profile %q; switch to another profile first", name)
	}

	targetDir := filepath.Join(getProfilesDir(), name)
	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		return fmt.Errorf("profile %q does not exist", name)
	}

	return os.RemoveAll(targetDir)
}

func RenameProfile(oldName, newName string) error {
	profileMu.Lock()
	defer profileMu.Unlock()

	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)

	if !validNameRe.MatchString(oldName) || !validNameRe.MatchString(newName) {
		return fmt.Errorf("invalid profile name: old=%s, new=%s", oldName, newName)
	}

	oldDir := filepath.Join(getProfilesDir(), oldName)
	newDir := filepath.Join(getProfilesDir(), newName)

	if _, err := os.Stat(oldDir); os.IsNotExist(err) {
		return fmt.Errorf("profile %q does not exist", oldName)
	}
	if _, err := os.Stat(newDir); err == nil {
		return fmt.Errorf("profile %q already exists", newName)
	}

	if err := os.Rename(oldDir, newDir); err != nil {
		return fmt.Errorf("failed to rename profile directory: %w", err)
	}

	cur := GetCurrentProfile()
	if cur == oldName {
		activeFile := getActiveFilePath()
		_ = os.WriteFile(activeFile, []byte(newName+"\n"), 0600)
	}

	return nil
}
