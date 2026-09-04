package pid

import (
	"os"
	"testing"
)

func TestPidLifecycle(t *testing.T) {
	comp := "test-comp"
	_ = RemovePid(comp)
	defer RemovePid(comp)

	info, err := RegisterPid(comp, 12345)
	if err != nil {
		t.Fatalf("RegisterPid failed: %v", err)
	}
	if info.Pid != os.Getpid() {
		t.Errorf("Expected pid %d, got %d", os.Getpid(), info.Pid)
	}
	if info.Port != 12345 {
		t.Errorf("Expected port 12345, got %d", info.Port)
	}

	read, err := ReadPid(comp)
	if err != nil || read == nil {
		t.Fatalf("ReadPid failed: %v", err)
	}
	if read.Pid != os.Getpid() {
		t.Errorf("Read pid mismatch: %d != %d", read.Pid, os.Getpid())
	}

	if !IsPidRunning(os.Getpid()) {
		t.Errorf("Current process should be running")
	}
	if IsPidRunning(99999999) {
		t.Errorf("Invalid pid should not be running")
	}

	_ = RemovePid(comp)
	if _, err := ReadPid(comp); err == nil {
		t.Errorf("Expected ReadPid to fail after RemovePid")
	}
}
