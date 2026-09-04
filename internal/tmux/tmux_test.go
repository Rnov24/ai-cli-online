package tmux

import (
	"testing"
)

func TestTmuxHelpers(t *testing.T) {
	tok := "secret-token"
	sessName := TokenToSessionName(tok)
	if sessName == "" || len(sessName) < 10 {
		t.Errorf("Unexpected token session name: %s", sessName)
	}

	full := BuildSessionName(tok, "pane-1")
	expected := sessName + "-pane-1"
	if full != expected {
		t.Errorf("Expected %s, got %s", expected, full)
	}

	if !IsValidSessionId("default") {
		t.Errorf("'default' should be valid session id")
	}
	if !IsValidSessionId("session_123-abc") {
		t.Errorf("'session_123-abc' should be valid session id")
	}
	if IsValidSessionId("invalid/session") {
		t.Errorf("'invalid/session' should not be valid session id")
	}
	if IsValidSessionId("too_long_session_name_exceeding_thirty_two_characters_limit") {
		t.Errorf("Overly long session id should not be valid")
	}
}
