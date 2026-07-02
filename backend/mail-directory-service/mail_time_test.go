package main

import "testing"

func TestNormalizeTimestampString(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want string
	}{
		{"2026-06-16 12:52:00", "2026-06-16T12:52:00Z"},
		{"2026-06-16T14:52:00+02:00", "2026-06-16T12:52:00Z"},
		{"", ""},
	}
	for _, tc := range cases {
		got := normalizeTimestampString(tc.in)
		if got != tc.want {
			t.Errorf("normalizeTimestampString(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
