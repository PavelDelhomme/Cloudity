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

func TestHeaderContainsDeliveredTo(t *testing.T) {
	hdr := "Delivered-To: inscriptions@alias.example\r\nTo: user@main.example\r\n"
	if !headerContainsDeliveredTo(hdr, "inscriptions@alias.example") {
		t.Fatal("expected match on Delivered-To")
	}
	if headerContainsDeliveredTo(hdr, "other@alias.example") {
		t.Fatal("unexpected match")
	}
	hdr2 := "X-Original-To: shop@alias.example\r\n"
	if !headerContainsDeliveredTo(hdr2, "shop@alias.example") {
		t.Fatal("expected X-Original-To match")
	}
}

func TestDeliveredToSQLClause(t *testing.T) {
	cl := deliveredToSQLClause(3)
	if !strings.Contains(cl, "$3") || !strings.Contains(cl, "$4") || !strings.Contains(cl, "raw_headers") {
		t.Fatalf("unexpected clause: %s", cl)
	}
}

func TestParseRFC822Mail_HTMLAsAttachmentDisposition(t *testing.T) {
	raw := []byte("From: impots@test\r\nTo: user@test\r\nSubject: Declaration\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\nContent-Disposition: attachment; filename=\"no-name\"\r\n\r\n<html><body>Corps impots</body></html>\r\n--b--\r\n")
	res, err := parseRFC822Mail(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.HTML, "Corps impots") {
		t.Fatalf("expected HTML body, got plain=%q html=%q", res.Plain, res.HTML)
	}
}
