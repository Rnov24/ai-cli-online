package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTaskAutoOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ai-cli-task-auto-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := Open(tempDir)
	if err != nil {
		t.Fatalf("Failed to open db: %v", err)
	}
	defer database.Close()

	sessionName := "test-session-auto"
	taskDir := filepath.Join(tempDir, "AiTasks", "module-1")

	// 1. Initial get should return nil
	existing, err := database.GetTaskAuto(sessionName)
	if err != nil {
		t.Fatalf("GetTaskAuto failed: %v", err)
	}
	if existing != nil {
		t.Fatalf("Expected nil, got %+v", existing)
	}

	// 2. Upsert record
	rec := &TaskAutoRecord{
		SessionName:    sessionName,
		TaskDir:        taskDir,
		Status:         "running",
		MaxIterations:  25,
		TimeoutMinutes: 45,
		IterationCount: 1,
		LastSignalAt:   "2026-09-08T18:00:00Z",
	}
	if err := database.UpsertTaskAuto(rec); err != nil {
		t.Fatalf("UpsertTaskAuto failed: %v", err)
	}

	// 3. Get by session
	fetched, err := database.GetTaskAuto(sessionName)
	if err != nil {
		t.Fatalf("GetTaskAuto failed: %v", err)
	}
	if fetched == nil {
		t.Fatalf("Expected record, got nil")
	}
	if fetched.TaskDir != taskDir || fetched.MaxIterations != 25 || fetched.TimeoutMinutes != 45 {
		t.Fatalf("Fetched mismatch: %+v", fetched)
	}

	// 4. Get by dir
	byDir, err := database.GetTaskAutoByDir(taskDir)
	if err != nil {
		t.Fatalf("GetTaskAutoByDir failed: %v", err)
	}
	if byDir == nil || byDir.SessionName != sessionName {
		t.Fatalf("GetTaskAutoByDir mismatch: %+v", byDir)
	}

	// 5. Update signal
	if err := database.UpdateTaskAutoSignal(sessionName, 2, "2026-09-08T18:05:00Z"); err != nil {
		t.Fatalf("UpdateTaskAutoSignal failed: %v", err)
	}
	updated, _ := database.GetTaskAuto(sessionName)
	if updated.IterationCount != 2 || updated.LastSignalAt != "2026-09-08T18:05:00Z" {
		t.Fatalf("UpdateTaskAutoSignal did not update properly: %+v", updated)
	}

	// 6. List running
	running, err := database.ListRunningTaskAuto()
	if err != nil {
		t.Fatalf("ListRunningTaskAuto failed: %v", err)
	}
	if len(running) != 1 || running[0].SessionName != sessionName {
		t.Fatalf("ListRunningTaskAuto unexpected results: %+v", running)
	}

	// 7. Delete by session
	if err := database.DeleteTaskAuto(sessionName); err != nil {
		t.Fatalf("DeleteTaskAuto failed: %v", err)
	}
	deleted, _ := database.GetTaskAuto(sessionName)
	if deleted != nil {
		t.Fatalf("Expected nil after delete, got %+v", deleted)
	}
}
