package main

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func sha256HexContent(content []byte) string {
	if len(content) == 0 {
		return ""
	}
	sum := sha256.Sum256(content)
	return strings.ToLower(hex.EncodeToString(sum[:]))
}

func contentHashParam(hash string) any {
	if strings.TrimSpace(hash) == "" {
		return nil
	}
	return hash
}
