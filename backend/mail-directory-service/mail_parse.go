package main

import (
	"bytes"
	"fmt"
	"io"
	netmail "net/mail"
	"strings"
	"time"

	"github.com/emersion/go-message/mail"
)

const (
	maxAttachmentBytesPerPart = 512 * 1024
	maxAttachmentsPerMessage  = 24
	maxRawHeadersBytes        = 512 * 1024
)

// deliveredToSQLClause filtre to_addrs et en-têtes préservés par le MTA (Delivered-To, etc.).
func deliveredToSQLClause(paramIdx int) string {
	hdr := fmt.Sprintf("$%d", paramIdx+1)
	to := fmt.Sprintf("$%d", paramIdx)
	return fmt.Sprintf(` AND (
		LOWER(m.to_addrs) LIKE %s
		OR LOWER(COALESCE(m.raw_headers, '')) LIKE %s
	)`, to, hdr)
}

// headerContainsDeliveredTo indique si raw_headers contient l’adresse alias recherchée.
func headerContainsDeliveredTo(rawHeaders, aliasLower string) bool {
	if rawHeaders == "" || aliasLower == "" {
		return false
	}
	h := strings.ToLower(rawHeaders)
	needle := strings.ToLower(aliasLower)
	for _, prefix := range []string{"delivered-to:", "x-original-to:", "x-envelope-to:"} {
		if idx := strings.Index(h, prefix); idx >= 0 {
			rest := h[idx+len(prefix):]
			if end := strings.IndexAny(rest, "\r\n"); end >= 0 {
				rest = rest[:end]
			}
			if strings.Contains(rest, needle) {
				return true
			}
		}
	}
	return strings.Contains(h, needle)
}

type mailParsedMeta struct {
	InternetMsgID    string
	InReplyTo        string
	ReferencesHeader string
	ThreadKey        string
	AttachmentCount  int
	Date             time.Time
}

type mailAttachmentParsed struct {
	Ordinal     int
	Filename    string
	ContentType string
	SizeBytes   int
	Content     []byte // nil si dépassement de taille
}

type mailParsedResult struct {
	Plain, HTML string
	RawHeaders  string
	Meta        mailParsedMeta
	Attachments []mailAttachmentParsed
}

// extractRawMIMEHeaders renvoie le bloc d’en-têtes (avant la première ligne vide), tronqué pour la base.
func extractRawMIMEHeaders(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var hdr []byte
	if i := bytes.Index(raw, []byte("\r\n\r\n")); i >= 0 {
		hdr = raw[:i]
	} else if i := bytes.Index(raw, []byte("\n\n")); i >= 0 {
		hdr = raw[:i]
	} else {
		hdr = raw
	}
	if len(hdr) > maxRawHeadersBytes {
		return string(hdr[:maxRawHeadersBytes])
	}
	return string(hdr)
}

// parseDateFromHeaderBlock lit un bloc HEADER.FIELDS (DATE) renvoyé par IMAP.
func parseDateFromHeaderBlock(header []byte) time.Time {
	if len(header) == 0 {
		return time.Time{}
	}
	msg, err := netmail.ReadMessage(bytes.NewReader(header))
	if err != nil {
		return time.Time{}
	}
	ds := strings.TrimSpace(msg.Header.Get("Date"))
	if ds == "" {
		return time.Time{}
	}
	t, err := netmail.ParseDate(ds)
	if err != nil || t.IsZero() {
		return time.Time{}
	}
	return t
}

func normalizeMessageID(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "<")
	s = strings.TrimSuffix(s, ">")
	return strings.TrimSpace(s)
}

// threadKeyFromHeaders choisit une clé stable de conversation (premier Message-ID de References si présent).
func threadKeyFromHeaders(messageID, inReplyTo, references string) string {
	for _, tok := range strings.Fields(references) {
		if id := normalizeMessageID(tok); id != "" {
			return id
		}
	}
	if id := normalizeMessageID(inReplyTo); id != "" {
		return id
	}
	if id := normalizeMessageID(messageID); id != "" {
		return id
	}
	return ""
}

func parseRFC822Mail(raw []byte) (*mailParsedResult, error) {
	if len(raw) == 0 {
		return &mailParsedResult{}, nil
	}
	mr, err := mail.CreateReader(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	res := &mailParsedResult{}
	res.Meta.InternetMsgID = normalizeMessageID(mr.Header.Get("Message-Id"))
	res.Meta.InReplyTo = normalizeMessageID(mr.Header.Get("In-Reply-To"))
	res.Meta.ReferencesHeader = strings.TrimSpace(mr.Header.Get("References"))
	res.Meta.ThreadKey = threadKeyFromHeaders(res.Meta.InternetMsgID, res.Meta.InReplyTo, res.Meta.ReferencesHeader)
	if d, err := mr.Header.Date(); err == nil && !d.IsZero() {
		res.Meta.Date = d
	} else if ds := strings.TrimSpace(mr.Header.Get("Date")); ds != "" {
		if t, perr := netmail.ParseDate(ds); perr == nil && !t.IsZero() {
			res.Meta.Date = t
		}
	}

	ordinal := 0
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		switch h := p.Header.(type) {
		case *mail.InlineHeader:
			absorbTextMIMEPart(h.Get("Content-Type"), p.Body, res)
		case *mail.AttachmentHeader:
			ct := strings.ToLower(strings.TrimSpace(h.Get("Content-Type")))
			if strings.HasPrefix(ct, "text/plain") || strings.HasPrefix(ct, "text/html") {
				absorbTextMIMEPart(ct, p.Body, res)
				continue
			}
			if ordinal >= maxAttachmentsPerMessage {
				_, _ = io.Copy(io.Discard, p.Body)
				continue
			}
			fn, _ := h.Filename()
			fn = strings.TrimSpace(fn)
			if fn == "" {
				fn = "piece-jointe"
			}
			attachCT := h.Get("Content-Type")
			if attachCT == "" {
				attachCT = "application/octet-stream"
			}
			if i := strings.Index(attachCT, ";"); i >= 0 {
				attachCT = strings.TrimSpace(attachCT[:i])
			}
			lim := io.LimitedReader{R: p.Body, N: maxAttachmentBytesPerPart + 1}
			buf, rerr := io.ReadAll(&lim)
			if rerr != nil {
				_, _ = io.Copy(io.Discard, p.Body)
				continue
			}
			var content []byte
			size := len(buf)
			if size > maxAttachmentBytesPerPart {
				content = nil
				_, _ = io.Copy(io.Discard, p.Body)
			} else {
				content = buf
			}
			res.Attachments = append(res.Attachments, mailAttachmentParsed{
				Ordinal:     ordinal,
				Filename:    fn,
				ContentType: attachCT,
				SizeBytes:   size,
				Content:     content,
			})
			ordinal++
		default:
			_, _ = io.Copy(io.Discard, p.Body)
		}
	}
	res.Meta.AttachmentCount = len(res.Attachments)
	res.RawHeaders = extractRawMIMEHeaders(raw)
	return res, nil
}

// absorbTextMIMEPart extrait text/plain ou text/html (impots.gouv et autres envois
// avec Content-Disposition: attachment sur la partie HTML).
func absorbTextMIMEPart(contentType string, body io.Reader, res *mailParsedResult) {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}
	b, err := io.ReadAll(body)
	if err != nil || len(b) == 0 {
		return
	}
	text := strings.TrimSpace(string(b))
	if text == "" {
		return
	}
	if strings.HasPrefix(ct, "text/plain") && res.Plain == "" {
		res.Plain = text
	} else if strings.HasPrefix(ct, "text/html") && res.HTML == "" {
		res.HTML = text
	}
}

// extractAttachmentOrdinal relit le MIME et renvoie le contenu de la pièce jointe d’indice ordinal (0-based, même ordre que parseRFC822Mail).
func extractAttachmentOrdinal(raw []byte, wantOrdinal int) (filename, contentType string, data []byte, err error) {
	if wantOrdinal < 0 || wantOrdinal >= maxAttachmentsPerMessage {
		return "", "", nil, fmt.Errorf("ordinal invalide")
	}
	mr, err := mail.CreateReader(bytes.NewReader(raw))
	if err != nil {
		return "", "", nil, err
	}
	ordinal := 0
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			return "", "", nil, fmt.Errorf("pièce jointe introuvable")
		}
		if err != nil {
			return "", "", nil, err
		}
		if ah, ok := p.Header.(*mail.AttachmentHeader); ok {
			if ordinal == wantOrdinal {
				fn, _ := ah.Filename()
				fn = strings.TrimSpace(fn)
				if fn == "" {
					fn = "piece-jointe"
				}
				ct := ah.Get("Content-Type")
				if ct == "" {
					ct = "application/octet-stream"
				}
				if i := strings.Index(ct, ";"); i >= 0 {
					ct = strings.TrimSpace(ct[:i])
				}
				data, err = io.ReadAll(p.Body)
				return fn, ct, data, err
			}
			ordinal++
			_, _ = io.Copy(io.Discard, p.Body)
			continue
		}
		if ih, ok := p.Header.(*mail.InlineHeader); ok {
			ct := strings.ToLower(strings.TrimSpace(ih.Get("Content-Type")))
			if strings.HasPrefix(ct, "text/plain") || strings.HasPrefix(ct, "text/html") {
				_, _ = io.Copy(io.Discard, p.Body)
				continue
			}
		}
		_, _ = io.Copy(io.Discard, p.Body)
	}
}
