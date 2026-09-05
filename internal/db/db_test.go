package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDBOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}
	defer database.Close()

	// 1. Drafts
	sess := "test-session"
	if err := database.SaveDraft(sess, "Hello world draft"); err != nil {
		t.Errorf("SaveDraft failed: %v", err)
	}
	content, err := database.GetDraft(sess)
	if err != nil || content != "Hello world draft" {
		t.Errorf("GetDraft failed: %v, got: %s", err, content)
	}
	if err := database.DeleteDraft(sess); err != nil {
		t.Errorf("DeleteDraft failed: %v", err)
	}
	content, err = database.GetDraft(sess)
	if err != nil || content != "" {
		t.Errorf("Expected empty draft after delete, got: %s", content)
	}

	// 2. Settings
	tokenHash := "mock-token-hash"
	key := "theme"
	if err := database.SaveSetting(tokenHash, key, "dark"); err != nil {
		t.Errorf("SaveSetting failed: %v", err)
	}
	val, ok, err := database.GetSetting(tokenHash, key)
	if err != nil || !ok || val != "dark" {
		t.Errorf("GetSetting failed: ok=%v, val=%s, err=%v", ok, val, err)
	}

	// 3. Annotations
	fPath := filepath.Join(tempDir, "sample.md")
	annContent := `{"annotations":[{"id":1}]}`
	if err := database.SaveAnnotation(sess, fPath, annContent, 123456789); err != nil {
		t.Errorf("SaveAnnotation failed: %v", err)
	}
	ann, err := database.GetAnnotation(sess, fPath)
	if err != nil || ann == nil || ann.Content != annContent {
		t.Errorf("GetAnnotation failed: %v, got: %+v", err, ann)
	}

	// 4. Workspaces
	homePath := filepath.Join(tempDir, "home")
	projPath := filepath.Join(tempDir, "project1")

	// Add Home
	wsHome, err := database.AddWorkspace("home", "Home (~)", homePath, true)
	if err != nil || wsHome == nil || !wsHome.IsHome {
		t.Fatalf("AddWorkspace for home failed: %v", err)
	}

	// Add Project
	wsProj, err := database.AddWorkspace("ws-1", "Project 1", projPath, false)
	if err != nil || wsProj == nil || wsProj.IsHome {
		t.Fatalf("AddWorkspace for project failed: %v", err)
	}

	// List
	list, err := database.ListWorkspaces()
	if err != nil || len(list) != 2 {
		t.Fatalf("ListWorkspaces failed: len=%d, err=%v", len(list), err)
	}
	// Home should be first because of is_home DESC
	if !list[0].IsHome || list[0].Id != "home" {
		t.Errorf("Expected Home first in ListWorkspaces, got: %+v", list[0])
	}

	// Get by path
	byPath, err := database.GetWorkspaceByPath(projPath)
	if err != nil || byPath == nil || byPath.Name != "Project 1" {
		t.Errorf("GetWorkspaceByPath failed: %v, got: %+v", err, byPath)
	}

	// Protected deletion of Home
	if err := database.DeleteWorkspace("home"); err != nil {
		t.Errorf("DeleteWorkspace home threw error: %v", err)
	}
	listAfterHomeDel, _ := database.ListWorkspaces()
	if len(listAfterHomeDel) != 2 {
		t.Errorf("Home should NOT have been deleted, count: %d", len(listAfterHomeDel))
	}

	// Deletion of Project
	if err := database.DeleteWorkspace("ws-1"); err != nil {
		t.Errorf("DeleteWorkspace ws-1 failed: %v", err)
	}
	listAfterProjDel, _ := database.ListWorkspaces()
	if len(listAfterProjDel) != 1 {
		t.Errorf("Project should have been deleted, count: %d", len(listAfterProjDel))
	}

	database.Checkpoint()
}

