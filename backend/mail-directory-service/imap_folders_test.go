package main

import (
	"context"
	"errors"
	"testing"

	"github.com/emersion/go-imap"
)

func TestSpecialUseFromIMAPAttributes(t *testing.T) {
	if g := specialUseFromIMAPAttributes([]string{imap.TrashAttr, "\\Noselect"}); g != "trash" {
		t.Fatalf("trash: got %q", g)
	}
	if g := specialUseFromIMAPAttributes([]string{imap.SentAttr}); g != "sent" {
		t.Fatalf("sent: got %q", g)
	}
	if g := specialUseFromIMAPAttributes([]string{imap.JunkAttr}); g != "spam" {
		t.Fatalf("spam: got %q", g)
	}
	if g := specialUseFromIMAPAttributes(nil); g != "" {
		t.Fatalf("empty: got %q", g)
	}
}

func TestInferSpecialUseFromPathAndLabel(t *testing.T) {
	cases := []struct {
		path, label, want string
	}{
		{"INBOX", "INBOX", ""},
		{"INBOX.Trash", "Trash", "trash"},
		{"Corbeille", "Corbeille", "trash"},
		{"INBOX.Corbeille", "Corbeille", "trash"},
		{"INBOX.Sent", "Envoyés", "sent"},
		{"INBOX.Envoyés", "Envoyés", "sent"},
		{"Courrier indésirable", "Courrier indésirable", "spam"},
		{"INBOX.Drafts", "Brouillons", "drafts"},
	}
	for _, tc := range cases {
		if g := inferSpecialUseFromPathAndLabel(tc.path, tc.label); g != tc.want {
			t.Fatalf("%s / %s: want %q, got %q", tc.path, tc.label, tc.want, g)
		}
	}
}

func TestMergeUniqueImapPaths(t *testing.T) {
	got := mergeUniqueImapPaths([]string{"A", "b"}, []string{"a", "C"})
	if len(got) != 3 || got[0] != "A" || got[1] != "b" || got[2] != "C" {
		t.Fatalf("merge: %#v", got)
	}
}

func TestIsBenignImapSelectErr(t *testing.T) {
	if !isBenignImapSelectErr(errors.New(`Mailbox doesn't exist: Archive`)) {
		t.Fatal("expected benign for missing mailbox")
	}
	if !isBenignImapSelectErr(errors.New(`Invalid mailbox name: Name must not have '/' characters`)) {
		t.Fatal("expected benign for invalid name")
	}
	if !isBenignImapSelectErr(context.Canceled) {
		t.Fatal("expected benign for context.Canceled")
	}
	if isBenignImapSelectErr(errors.New("NO [AUTHENTICATIONFAILED]")) {
		t.Fatal("auth failure must not be benign")
	}
	if isBenignImapSelectErr(nil) {
		t.Fatal("nil is not benign")
	}
}

func TestImapArchiveCandidatesOrder(t *testing.T) {
	got := imapMailboxCandidatesForDbFolder("archive")
	if len(got) < 2 || got[len(got)-1] != "[Gmail]/Archive" {
		t.Fatalf("want [Gmail]/Archive last, got %#v", got)
	}
}
