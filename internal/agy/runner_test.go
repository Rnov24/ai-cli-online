package agy

import (
	"testing"
)

func TestResolveAgyBinary(t *testing.T) {
	bin := ResolveAgyBinary()
	if bin == "" {
		t.Fatal("ResolveAgyBinary returned empty path")
	}
	t.Logf("Resolved agy binary: %s", bin)
}

func TestStopSession(t *testing.T) {
	// Should not panic or error on non-existent session
	StopSession("non-existent-session-id")
}



