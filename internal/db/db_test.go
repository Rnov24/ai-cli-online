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

	fPath2 := filepath.Join(tempDir, "sample2.md")
	_ = database.SaveAnnotation(sess, fPath2, annContent, 123456790)
	if err := database.DeleteAnnotationsForSession(sess); err != nil {
		t.Errorf("DeleteAnnotationsForSession failed: %v", err)
	}
	annAfter1, _ := database.GetAnnotation(sess, fPath)
	annAfter2, _ := database.GetAnnotation(sess, fPath2)
	if annAfter1 != nil || annAfter2 != nil {
		t.Errorf("Expected annotations to be deleted, got ann1: %v, ann2: %v", annAfter1, annAfter2)
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

func TestTurnJournalOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-turn-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}
	defer database.Close()

	sess := "session-test-journal"

	// 1. Create turn entry
	entry := TurnJournalEntry{
		Id:             "turn-1",
		SessionName:    sess,
		ConversationId: "conv-1",
		Prompt:         "Analyze repository architecture",
		Status:         "submitted",
	}
	if err := database.CreateTurnJournal(entry); err != nil {
		t.Fatalf("CreateTurnJournal failed: %v", err)
	}

	// 2. Query active turn
	active, err := database.GetActiveTurn(sess)
	if err != nil || active == nil {
		t.Fatalf("GetActiveTurn failed: %v, active=%+v", err, active)
	}
	if active.Id != "turn-1" || active.Status != "submitted" {
		t.Errorf("Unexpected active turn: %+v", active)
	}

	// 3. Update turn to running and completed
	if err := database.UpdateTurnJournal("turn-1", "running", "", "", "", 0, 0); err != nil {
		t.Fatalf("UpdateTurnJournal to running failed: %v", err)
	}

	toolCalls := `[{"id":"tool_1","name":"view_file","status":"success"}]`
	fullResp := "Here is the repository overview."
	if err := database.UpdateTurnJournal("turn-1", "completed", fullResp, toolCalls, "", 3.5, 120); err != nil {
		t.Fatalf("UpdateTurnJournal to completed failed: %v", err)
	}

	// 4. Verify no active turn remains
	activeAfterComplete, err := database.GetActiveTurn(sess)
	if err != nil || activeAfterComplete != nil {
		t.Errorf("Expected nil active turn, got %+v", activeAfterComplete)
	}

	// 5. Test crash / interrupted recovery
	entry2 := TurnJournalEntry{
		Id:             "turn-2",
		SessionName:    sess,
		ConversationId: "conv-1",
		Prompt:         "Long running compilation",
		Status:         "running",
	}
	if err := database.CreateTurnJournal(entry2); err != nil {
		t.Fatalf("CreateTurnJournal 2 failed: %v", err)
	}

	aff, err := database.MarkInterruptedTurns(sess)
	if err != nil || aff != 1 {
		t.Fatalf("MarkInterruptedTurns failed: aff=%d, err=%v", aff, err)
	}

	// Check that turn-2 is now interrupted
	journal, err := database.GetSessionJournal(sess)
	if err != nil || len(journal) != 2 {
		t.Fatalf("GetSessionJournal failed: len=%d, err=%v", len(journal), err)
	}
	if journal[0].Id != "turn-1" || journal[0].Status != "completed" {
		t.Errorf("Unexpected turn 1 in journal: %+v", journal[0])
	}
	if journal[1].Id != "turn-2" || journal[1].Status != "interrupted" {
		t.Errorf("Unexpected turn 2 in journal: %+v", journal[1])
	}

	// Global mark all active
	entry3 := TurnJournalEntry{
		Id:             "turn-3",
		SessionName:    "other-sess",
		ConversationId: "conv-2",
		Prompt:         "Test restart",
		Status:         "submitted",
	}
	_ = database.CreateTurnJournal(entry3)
	allAff, err := database.MarkAllActiveTurnsInterrupted()
	if err != nil || allAff != 1 {
		t.Errorf("MarkAllActiveTurnsInterrupted failed: aff=%d, err=%v", allAff, err)
	}
}


