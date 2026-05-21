package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"
)

type config struct {
	ListenAddr       string
	MailDirectoryURL string
	InternalToken    string
	RelayHost        string
	RelayPort        string
	RelayUsername    string
	RelayPassword    string
	RelayFrom        string
}

type aliasResolution struct {
	AliasEmail string `json:"alias_email"`
	DeliverTo  string `json:"deliver_to"`
	AccountID  int    `json:"account_id"`
	OK         bool   `json:"ok"`
}

func main() {
	cfg := loadConfig()
	if cfg.InternalToken == "" {
		log.Fatal("MTA_INTERNAL_TOKEN is required")
	}
	if cfg.MailDirectoryURL == "" {
		log.Fatal("MAIL_DIRECTORY_URL is required")
	}

	ln, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		log.Fatalf("listen %s: %v", cfg.ListenAddr, err)
	}
	log.Printf("alias-router listening on %s", cfg.ListenAddr)
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("accept: %v", err)
			continue
		}
		go func() {
			if err := handleSMTP(conn, cfg); err != nil && !errors.Is(err, io.EOF) {
				log.Printf("smtp session: %v", err)
			}
		}()
	}
}

func loadConfig() config {
	return config{
		ListenAddr:       getenv("ALIAS_ROUTER_LISTEN_ADDR", ":2527"),
		MailDirectoryURL: strings.TrimRight(os.Getenv("MAIL_DIRECTORY_URL"), "/"),
		InternalToken:    os.Getenv("MTA_INTERNAL_TOKEN"),
		RelayHost:        getenv("RELAY_SMTP_HOST", "host.docker.internal"),
		RelayPort:        getenv("RELAY_SMTP_PORT", "587"),
		RelayUsername:    os.Getenv("RELAY_SMTP_USERNAME"),
		RelayPassword:    os.Getenv("RELAY_SMTP_PASSWORD"),
		RelayFrom:        os.Getenv("RELAY_FROM"),
	}
}

func getenv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func handleSMTP(conn net.Conn, cfg config) error {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Minute))

	reader := bufio.NewReader(conn)
	writer := bufio.NewWriter(conn)
	writeLine := func(format string, args ...any) error {
		if _, err := fmt.Fprintf(writer, format+"\r\n", args...); err != nil {
			return err
		}
		return writer.Flush()
	}

	if err := writeLine("220 cloudity alias-router ESMTP"); err != nil {
		return err
	}

	var mailFrom string
	resolutions := map[string]aliasResolution{}

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if err := writeLine("500 empty command"); err != nil {
				return err
			}
			continue
		}
		verb, arg := splitCommand(line)

		switch verb {
		case "EHLO", "HELO":
			if verb == "EHLO" {
				if err := writeLine("250-cloudity alias-router"); err != nil {
					return err
				}
				if err := writeLine("250 SIZE 33554432"); err != nil {
					return err
				}
			} else if err := writeLine("250 cloudity alias-router"); err != nil {
				return err
			}
		case "MAIL":
			addr, err := parsePathArg(arg, "FROM")
			if err != nil {
				if err := writeLine("501 invalid MAIL FROM"); err != nil {
					return err
				}
				continue
			}
			mailFrom = addr
			resolutions = map[string]aliasResolution{}
			if err := writeLine("250 2.1.0 OK"); err != nil {
				return err
			}
		case "RCPT":
			addr, err := parsePathArg(arg, "TO")
			if err != nil {
				if err := writeLine("501 invalid RCPT TO"); err != nil {
					return err
				}
				continue
			}
			resolved, err := resolveAlias(context.Background(), cfg, addr)
			if err != nil {
				log.Printf("resolve %s: %v", addr, err)
				if err := writeLine("550 5.1.1 alias unknown or disabled"); err != nil {
					return err
				}
				continue
			}
			resolutions[strings.ToLower(addr)] = resolved
			if err := writeLine("250 2.1.5 OK"); err != nil {
				return err
			}
		case "DATA":
			if len(resolutions) == 0 {
				if err := writeLine("554 5.5.1 no valid recipients"); err != nil {
					return err
				}
				continue
			}
			if err := writeLine("354 End data with <CR><LF>.<CR><LF>"); err != nil {
				return err
			}
			msg, err := readSMTPData(reader)
			if err != nil {
				return err
			}
			if err := relayToResolvedRecipients(cfg, mailFrom, msg, resolutions); err != nil {
				log.Printf("relay failed: %v", err)
				if err := writeLine("451 4.3.0 relay failed"); err != nil {
					return err
				}
				continue
			}
			if err := writeLine("250 2.0.0 queued"); err != nil {
				return err
			}
		case "RSET":
			mailFrom = ""
			resolutions = map[string]aliasResolution{}
			if err := writeLine("250 2.0.0 reset"); err != nil {
				return err
			}
		case "NOOP":
			if err := writeLine("250 2.0.0 OK"); err != nil {
				return err
			}
		case "QUIT":
			_ = writeLine("221 2.0.0 bye")
			return nil
		default:
			if err := writeLine("502 command not implemented"); err != nil {
				return err
			}
		}
	}
}

func splitCommand(line string) (verb, arg string) {
	parts := strings.SplitN(line, " ", 2)
	verb = strings.ToUpper(strings.TrimSpace(parts[0]))
	if len(parts) == 2 {
		arg = strings.TrimSpace(parts[1])
	}
	return verb, arg
}

func parsePathArg(arg, key string) (string, error) {
	prefix := strings.ToUpper(key) + ":"
	if !strings.HasPrefix(strings.ToUpper(arg), prefix) {
		return "", fmt.Errorf("missing %s", prefix)
	}
	value := strings.TrimSpace(arg[len(prefix):])
	if idx := strings.IndexAny(value, " \t"); idx >= 0 {
		value = value[:idx]
	}
	value = strings.Trim(value, "<>")
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" || !strings.Contains(value, "@") {
		return "", fmt.Errorf("invalid address")
	}
	return value, nil
}

func readSMTPData(reader *bufio.Reader) ([]byte, error) {
	var buf bytes.Buffer
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, err
		}
		if line == ".\r\n" || line == ".\n" {
			return buf.Bytes(), nil
		}
		if strings.HasPrefix(line, "..") {
			line = line[1:]
		}
		buf.WriteString(line)
	}
}

func resolveAlias(ctx context.Context, cfg config, aliasEmail string) (aliasResolution, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	body, _ := json.Marshal(map[string]string{"alias_email": aliasEmail})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.MailDirectoryURL+"/mail/internal/alias-resolve", bytes.NewReader(body))
	if err != nil {
		return aliasResolution{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-MTA-Internal-Token", cfg.InternalToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return aliasResolution{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return aliasResolution{}, fmt.Errorf("alias-resolve status %d", resp.StatusCode)
	}

	var resolved aliasResolution
	if err := json.NewDecoder(resp.Body).Decode(&resolved); err != nil {
		return aliasResolution{}, err
	}
	if strings.TrimSpace(resolved.DeliverTo) == "" {
		return aliasResolution{}, fmt.Errorf("empty deliver_to")
	}
	return resolved, nil
}

func relayToResolvedRecipients(cfg config, mailFrom string, msg []byte, resolutions map[string]aliasResolution) error {
	for alias, resolved := range resolutions {
		envelopeFrom := cfg.RelayFrom
		if envelopeFrom == "" {
			envelopeFrom = mailFrom
		}
		if envelopeFrom == "" {
			envelopeFrom = alias
		}

		withHeaders := prependAliasHeaders(alias, msg)
		addr := net.JoinHostPort(cfg.RelayHost, cfg.RelayPort)
		var auth smtp.Auth
		if cfg.RelayUsername != "" || cfg.RelayPassword != "" {
			auth = smtp.PlainAuth("", cfg.RelayUsername, cfg.RelayPassword, cfg.RelayHost)
		}
		if err := smtp.SendMail(addr, auth, envelopeFrom, []string{resolved.DeliverTo}, withHeaders); err != nil {
			return fmt.Errorf("%s -> %s: %w", alias, resolved.DeliverTo, err)
		}
		log.Printf("delivered alias %s -> %s (account_id=%d)", alias, resolved.DeliverTo, resolved.AccountID)
	}
	return nil
}

func prependAliasHeaders(alias string, msg []byte) []byte {
	prefix := fmt.Sprintf("Delivered-To: %s\r\nX-Original-To: %s\r\nX-Envelope-To: %s\r\n", alias, alias, alias)
	return append([]byte(prefix), msg...)
}
