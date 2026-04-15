package main

import (
	"strings"
	"testing"
)

func TestExtractRawMIMEHeaders_CRLF(t *testing.T) {
	raw := []byte("From: a@b\r\nTo: c@d\r\nSubject: x\r\n\r\nbody")
	got := extractRawMIMEHeaders(raw)
	if !strings.Contains(got, "From: a@b") || strings.Contains(got, "body") {
		t.Fatalf("unexpected headers: %q", got)
	}
}

func TestParseRFC822Mail_IncludesRawHeaders(t *testing.T) {
	raw := []byte("Message-Id: <id1@x>\r\nFrom: sender@test\r\nTo: recv@test\r\nSubject: Hello\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHi")
	res, err := parseRFC822Mail(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.RawHeaders, "Message-Id:") || !strings.Contains(res.RawHeaders, "Subject: Hello") {
		t.Fatalf("RawHeaders missing expected lines: %q", res.RawHeaders)
	}
	if strings.Contains(res.RawHeaders, "Hi") {
		t.Fatalf("RawHeaders should not include body: %q", res.RawHeaders)
	}
}
