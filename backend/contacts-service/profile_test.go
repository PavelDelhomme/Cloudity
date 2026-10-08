package main

import "testing"

func TestComposeDisplayName(t *testing.T) {
	p := ContactProfile{GivenName: "Jean", FamilyName: "Dupont", Prefix: "M."}
	if got := composeDisplayName(p, ""); got != "M. Jean Dupont" {
		t.Fatalf("got %q", got)
	}
	p.FileAs = "Dupont, Jean"
	if got := composeDisplayName(p, ""); got != "Dupont, Jean" {
		t.Fatalf("file_as got %q", got)
	}
}

func TestPrimaryPhoneFR(t *testing.T) {
	p := ContactProfile{Phones: []labeledPhone{{Label: "mobile", Value: "0612345678", Country: "FR"}}}
	if got := primaryPhoneFromProfile(p, ""); got != "+33612345678" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatContactAddress(t *testing.T) {
	got := formatContactAddress(contactAddress{
		Street: "12 rue de la Paix", PostalCode: "75002", City: "Paris", Country: "France",
	})
	if got != "12 rue de la Paix, 75002 Paris, France" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeRequiresIdentity(t *testing.T) {
	_, _, _, _, err := normalizeContactFields("", "", "", ContactProfile{})
	if err == "" {
		t.Fatal("expected error")
	}
}
