package main

import "testing"

func TestIsPlaceholderCloudityLoginEmail(t *testing.T) {
	t.Parallel()
	cases := []struct {
		email string
		want  bool
	}{
		{"admin@cloudity.local", true},
		{"e2e-2fa@cloudity.local", true},
		{"paul@delhomme.ovh", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := isPlaceholderCloudityLoginEmail(tc.email); got != tc.want {
			t.Fatalf("%q: got %v want %v", tc.email, got, tc.want)
		}
	}
}
