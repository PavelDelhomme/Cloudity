package recovery_test

import (
	"strings"
	"testing"

	"github.com/pavel/cloudity/auth-service/recovery"
)

func TestGenerateRecoveryCodeFormat(t *testing.T) {
	for i := 0; i < 200; i++ {
		code, err := recovery.GenerateCode()
		if err != nil {
			t.Fatalf("GenerateCode: %v", err)
		}
		if len(code) != 14 {
			t.Errorf("len(code)=%d, want 14: %q", len(code), code)
		}
		if code[4] != '-' || code[9] != '-' {
			t.Errorf("tirets attendus aux positions 4 et 9: %q", code)
		}
		stripped := strings.ReplaceAll(code, "-", "")
		for _, c := range stripped {
			if !strings.ContainsRune(recovery.Alphabet, c) {
				t.Errorf("caractère hors alphabet: %q dans %q", c, code)
			}
		}
	}
}

func TestGenerateRecoveryCodeUniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		code, err := recovery.GenerateCode()
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
		got := recovery.NormalizeCode(tc.in)
		if got != tc.want {
			t.Errorf("normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestLooksLikeRecoveryCode(t *testing.T) {
	totps := []string{"123456", "000000", "987654"}
	for _, t6 := range totps {
		if recovery.LooksLikeRecoveryCode(t6) {
			t.Errorf("TOTP %q ne doit PAS ressembler à un code de récup", t6)
		}
	}
	codes := []string{"ABCD-EFGH-JKMN", "abcdefghjkmn", "AB CD-EF GH-JK MN"}
	for _, c := range codes {
		if !recovery.LooksLikeRecoveryCode(c) {
			t.Errorf("%q doit ressembler à un code de récup", c)
		}
	}
	if recovery.LooksLikeRecoveryCode("ABCD-EFGH-J!MN") {
		t.Error("caractère spécial doit être rejeté")
	}
	if recovery.LooksLikeRecoveryCode("ABC-DEFG-HJKM") {
		t.Error("11 chars doit être rejeté (12 attendus)")
	}
}

func TestRecoveryCodeAlphabetIsUnambiguous(t *testing.T) {
	for _, ambiguous := range []byte{'0', 'O', '1', 'I', 'L'} {
		if strings.IndexByte(recovery.Alphabet, ambiguous) >= 0 {
			t.Errorf("alphabet contient le char ambigu %q", ambiguous)
		}
	}
}
