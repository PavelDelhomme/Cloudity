package main

import (
	"strings"
	"testing"
)

// TestGenerateRecoveryCodeFormat — chaque code est `XXXX-XXXX-XXXX` (12
// caractères alphanumériques + 2 tirets) avec uniquement l'alphabet sans
// caractères ambigus.
func TestGenerateRecoveryCodeFormat(t *testing.T) {
	for i := 0; i < 200; i++ {
		code, err := generateRecoveryCode()
		if err != nil {
			t.Fatalf("generateRecoveryCode: %v", err)
		}
		if len(code) != 14 {
			t.Errorf("len(code)=%d, want 14: %q", len(code), code)
		}
		if code[4] != '-' || code[9] != '-' {
			t.Errorf("tirets attendus aux positions 4 et 9: %q", code)
		}
		stripped := strings.ReplaceAll(code, "-", "")
		for _, c := range stripped {
			if !strings.ContainsRune(recoveryCodeAlphabet, c) {
				t.Errorf("caractère hors alphabet: %q dans %q", c, code)
			}
		}
	}
}

// TestGenerateRecoveryCodeUniqueness — sur 100 générations on ne doit pas
// avoir de doublon (entropie suffisante).
func TestGenerateRecoveryCodeUniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		code, err := generateRecoveryCode()
		if err != nil {
			t.Fatal(err)
		}
		if _, dup := seen[code]; dup {
			t.Fatalf("collision sur %d générations: %q", i, code)
		}
		seen[code] = struct{}{}
	}
}

func TestNormalizeRecoveryCode(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"abcd-efgh-jkmn", "ABCDEFGHJKMN"},
		{"ABCD-EFGH-JKMN", "ABCDEFGHJKMN"},
		{"ABCDEFGHJKMN", "ABCDEFGHJKMN"},
		{"  ab cd-ef gh-jk mn  ", "ABCDEFGHJKMN"},
		{"abcd efgh jkmn", "ABCDEFGHJKMN"},
	}
	for _, tc := range cases {
		got := normalizeRecoveryCode(tc.in)
		if got != tc.want {
			t.Errorf("normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestLooksLikeRecoveryCode — distingue TOTP 6 chiffres d'un code de récup.
func TestLooksLikeRecoveryCode(t *testing.T) {
	totps := []string{"123456", "000000", "987654"}
	for _, t6 := range totps {
		if looksLikeRecoveryCode(t6) {
			t.Errorf("TOTP %q ne doit PAS ressembler à un code de récup", t6)
		}
	}
	codes := []string{
		"ABCD-EFGH-JKMN",
		"abcdefghjkmn",
		"AB CD-EF GH-JK MN",
	}
	for _, c := range codes {
		if !looksLikeRecoveryCode(c) {
			t.Errorf("%q doit ressembler à un code de récup", c)
		}
	}
	// 12 chars mais avec un caractère hors alphabet → on rejette.
	if looksLikeRecoveryCode("ABCD-EFGH-J!MN") {
		t.Error("caractère spécial doit être rejeté")
	}
	// 11 chars (trop court) → rejet.
	if looksLikeRecoveryCode("ABC-DEFG-HJKM") {
		t.Error("11 chars doit être rejeté (12 attendus)")
	}
}

// TestRecoveryCodeAlphabetIsUnambiguous — pas de 0/O, 1/I/L pour faciliter
// la transcription papier (anti-erreur de saisie).
func TestRecoveryCodeAlphabetIsUnambiguous(t *testing.T) {
	for _, ambiguous := range []byte{'0', 'O', '1', 'I', 'L'} {
		if strings.IndexByte(recoveryCodeAlphabet, ambiguous) >= 0 {
			t.Errorf("alphabet contient le char ambigu %q", ambiguous)
		}
	}
}
