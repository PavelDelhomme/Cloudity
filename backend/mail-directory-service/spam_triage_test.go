package main

import (
	"os"
	"testing"
)

func TestSpamScoreFromRawHeaders_Rspamd(t *testing.T) {
	raw := "Subject: Test\nX-Spam-Score: 12.5\nX-Spam-Status: No\n"
	if got := spamScoreFromRawHeaders(raw); got != 13 {
		t.Fatalf("got %d want 13", got)
	}
}

func TestSpamScoreFromRawHeaders_SpamStatusYes(t *testing.T) {
	raw := "X-Spam-Status: Yes, score=3.0\n"
	if got := spamScoreFromRawHeaders(raw); got != 80 {
		t.Fatalf("got %d want 80", got)
	}
}

func TestEffectiveSpamScore_PrefersRspamd(t *testing.T) {
	raw := "X-Spam-Score: 90\n"
	got := effectiveSpamScore("normal subject", "alice@example.com", raw)
	if got != 90 {
		t.Fatalf("got %d want 90", got)
	}
}

func TestEffectiveSpamScore_HeuristicWhenHigher(t *testing.T) {
	got := effectiveSpamScore("URGENT: FREE VIAGRA CLICK NOW", "spammer@evil.tk", "")
	if got < 52 {
		t.Fatalf("expected high heuristic score, got %d", got)
	}
}

func TestMailSpamAutoTriageConfig_Defaults(t *testing.T) {
	os.Unsetenv("MAIL_SPAM_AUTO_TRIAGE_ENABLED")
	os.Unsetenv("MAIL_SPAM_AUTO_TRIAGE_THRESHOLD")
	cfg := mailSpamAutoTriageConfig()
	if !cfg.Enabled || cfg.Threshold != 52 {
		t.Fatalf("unexpected default cfg: %+v", cfg)
	}
}

func TestMailSpamAutoTriageConfig_EnvOverride(t *testing.T) {
	t.Setenv("MAIL_SPAM_AUTO_TRIAGE_ENABLED", "0")
	t.Setenv("MAIL_SPAM_AUTO_TRIAGE_THRESHOLD", "70")
	cfg := mailSpamAutoTriageConfig()
	if cfg.Enabled || cfg.Threshold != 70 {
		t.Fatalf("unexpected cfg: %+v", cfg)
	}
}
