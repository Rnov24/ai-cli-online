package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huacheng/ai-cli-online/internal/agy"
	"github.com/huacheng/ai-cli-online/internal/config"
)

func TestAgyProfilesRoutes(t *testing.T) {
	tempDir := t.TempDir()
	agy.CustomCliDir = tempDir
	defer func() {
		agy.CustomCliDir = ""
	}()

	// Write initial token
	initialToken := filepath.Join(tempDir, "antigravity-oauth-token")
	_ = os.WriteFile(initialToken, []byte(`{"token":{"access_token":"init-tok"}}`), 0600)

	cfg := &config.Config{
		AuthToken: "test-secret-token",
	}
	auth := NewAuthHelper(cfg)
	handler := NewAgyProfilesHandler(auth)

	// 1. ListProfiles without auth should fail
	reqUnauthorized := httptest.NewRequest("GET", "/api/agy/profiles", nil)
	wUnauth := httptest.NewRecorder()
	handler.ListProfiles(wUnauth, reqUnauthorized)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", wUnauth.Code)
	}

	// 2. ListProfiles with auth
	reqList := httptest.NewRequest("GET", "/api/agy/profiles", nil)
	reqList.Header.Set("Authorization", "Bearer test-secret-token")
	wList := httptest.NewRecorder()
	handler.ListProfiles(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", wList.Code, wList.Body.String())
	}

	var listResp agy.ProfilesResponse
	if err := json.Unmarshal(wList.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if listResp.Current != "default" {
		t.Fatalf("expected current default, got %q", listResp.Current)
	}

	// 3. Save current profile as "personal"
	saveBody, _ := json.Marshal(map[string]string{"name": "personal"})
	reqSave := httptest.NewRequest("POST", "/api/agy/profiles/save", bytes.NewReader(saveBody))
	reqSave.Header.Set("Authorization", "Bearer test-secret-token")
	wSave := httptest.NewRecorder()
	handler.SaveProfile(wSave, reqSave)
	if wSave.Code != http.StatusOK {
		t.Fatalf("expected 200 for save, got %d: %s", wSave.Code, wSave.Body.String())
	}

	// 4. Import new profile "work"
	importBody, _ := json.Marshal(map[string]string{
		"name":  "work",
		"token": `{"token":{"access_token":"work-tok"}}`,
	})
	reqImport := httptest.NewRequest("POST", "/api/agy/profiles/import", bytes.NewReader(importBody))
	reqImport.Header.Set("Authorization", "Bearer test-secret-token")
	wImport := httptest.NewRecorder()
	handler.ImportProfile(wImport, reqImport)
	if wImport.Code != http.StatusOK {
		t.Fatalf("expected 200 for import, got %d: %s", wImport.Code, wImport.Body.String())
	}

	// 5. Switch back to "personal"
	switchBody, _ := json.Marshal(map[string]string{"name": "personal"})
	reqSwitch := httptest.NewRequest("POST", "/api/agy/profiles/switch", bytes.NewReader(switchBody))
	reqSwitch.Header.Set("Authorization", "Bearer test-secret-token")
	wSwitch := httptest.NewRecorder()
	handler.SwitchProfile(wSwitch, reqSwitch)
	if wSwitch.Code != http.StatusOK {
		t.Fatalf("expected 200 for switch, got %d: %s", wSwitch.Code, wSwitch.Body.String())
	}

	// 6. Rename "work" to "work-corp"
	renameBody, _ := json.Marshal(map[string]string{"oldName": "work", "newName": "work-corp"})
	reqRename := httptest.NewRequest("POST", "/api/agy/profiles/rename", bytes.NewReader(renameBody))
	reqRename.Header.Set("Authorization", "Bearer test-secret-token")
	wRename := httptest.NewRecorder()
	handler.RenameProfile(wRename, reqRename)
	if wRename.Code != http.StatusOK {
		t.Fatalf("expected 200 for rename, got %d: %s", wRename.Code, wRename.Body.String())
	}

	// 7. Delete "work-corp"
	reqDelete := httptest.NewRequest("DELETE", "/api/agy/profiles/work-corp", nil)
	reqDelete.SetPathValue("name", "work-corp")
	reqDelete.Header.Set("Authorization", "Bearer test-secret-token")
	wDelete := httptest.NewRecorder()
	handler.DeleteProfile(wDelete, reqDelete)
	if wDelete.Code != http.StatusOK {
		t.Fatalf("expected 200 for delete, got %d: %s", wDelete.Code, wDelete.Body.String())
	}
}
