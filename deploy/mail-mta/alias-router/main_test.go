package main

import (
	"bufio"
	"strings"
	"testing"
)

func TestParsePathArg(t *testing.T) {
	got, err := parsePathArg("TO:<Inscriptions@Alias.Example.Invalid> SIZE=123", "TO")
	if err != nil {
		t.Fatalf("parsePathArg returned error: %v", err)
	}
	if got != "inscriptions@alias.example.invalid" {
		t.Fatalf("got %q", got)
	}
}

func TestReadSMTPDataUnescapesDots(t *testing.T) {
	reader := bufio.NewReader(strings.NewReader("Subject: test\r\n..leading dot\r\n.\r\n"))
	got, err := readSMTPData(reader)
	if err != nil {
		t.Fatalf("readSMTPData returned error: %v", err)
	}
	want := "Subject: test\r\n.leading dot\r\n"
	if string(got) != want {
		t.Fatalf("got %q want %q", string(got), want)
	}
}

func TestPrependAliasHeaders(t *testing.T) {
	got := string(prependAliasHeaders("alias@example.invalid", []byte("Subject: hi\r\n\r\nbody")))
	for _, header := range []string{
		"Delivered-To: alias@example.invalid\r\n",
		"X-Original-To: alias@example.invalid\r\n",
		"X-Envelope-To: alias@example.invalid\r\n",
	} {
		if !strings.Contains(got, header) {
			t.Fatalf("missing header %q in %q", header, got)
		}
	}
}
