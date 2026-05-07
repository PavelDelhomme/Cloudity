package main

import "testing"

// Couvre `normalizeFromDomainPattern` : trim + lowercase + suppression du `@` éventuel.
func TestNormalizeFromDomainPattern(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"  ", ""},
		{"Example.COM", "example.com"},
		{"@gmail.com", "gmail.com"},
		{"@   ovh.NET ", "ovh.net"},
		{"  Cloudity.local ", "cloudity.local"},
	}
	for _, tc := range cases {
		got := normalizeFromDomainPattern(tc.in)
		if got != tc.want {
			t.Errorf("normalizeFromDomainPattern(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// Couvre `ruleFromDomainMatches` : motif vide -> match, match exact, match suffixe.
func TestRuleFromDomainMatches(t *testing.T) {
	cases := []struct {
		from    string
		pattern string
		want    bool
		desc    string
	}{
		{"alice@example.com", "", true, "motif vide -> match"},
		{"alice@example.com", "example.com", true, "match exact"},
		{"alice@MAIL.example.com", "example.com", true, "match suffixe (sous-domaine)"},
		{"alice@notexample.com", "example.com", false, "ne pas matcher domaine ressemblant sans `.`"},
		{"alice@example.org", "example.com", false, "TLD différent"},
		{"weird-from-without-at-sign", "example.com", false, "from sans @ -> domaine vide -> false"},
		{"  bob@CLOUDITY.LOCAL  ", "cloudity.local", true, "from avec espaces et casse mixte"},
		{"Bob <bob@CLOUDITY.LOCAL>", "cloudity.local", true, "from au format Display <addr@dom>"},
		{"\"Notify\" <noreply@MAIL.example.com>", "example.com", true, "Display name + sous-domaine"},
	}
	for _, tc := range cases {
		got := ruleFromDomainMatches(tc.from, tc.pattern)
		if got != tc.want {
			t.Errorf("[%s] ruleFromDomainMatches(%q, %q) = %v, want %v", tc.desc, tc.from, tc.pattern, got, tc.want)
		}
	}
}

func boolPtr(b bool) *bool { return &b }
func intPtr(n int) *int    { return &n }

// Couvre `ruleMatches` : conditions combinées (sujet + PJ + étiquette + destinataire + domaine).
func TestRuleMatches_CombinedConditions(t *testing.T) {
	msg := messageForRules{
		FromAddr:        "team@notify.example.com",
		ToAddrs:         "user@cloudity.local",
		Subject:         "[Alerte] Compteur",
		AttachmentCount: 2,
		TagIDs:          map[int]struct{}{42: {}},
	}

	cases := []struct {
		name string
		rule ruleMatchCriteria
		want bool
	}{
		{
			name: "règle vide -> match (toutes conditions optionnelles vides)",
			rule: ruleMatchCriteria{},
			want: true,
		},
		{
			name: "from + sujet + domaine + PJ vrai + tag présent -> match",
			rule: ruleMatchCriteria{
				FromPattern:    "team@",
				SubjectPattern: "alerte",
				FromDomainNorm: "example.com",
				HasAttachments: boolPtr(true),
				HasTagID:       intPtr(42),
			},
			want: true,
		},
		{
			name: "domaine ne matche pas -> rejet",
			rule: ruleMatchCriteria{FromDomainNorm: "other.com"},
			want: false,
		},
		{
			name: "destinataire absent -> rejet",
			rule: ruleMatchCriteria{RecipientPattern: "support@"},
			want: false,
		},
		{
			name: "destinataire présent (case-insensitive) -> match",
			rule: ruleMatchCriteria{RecipientPattern: "USER@CLOUDITY"},
			want: true,
		},
		{
			name: "exige aucune PJ alors qu'il y en a -> rejet",
			rule: ruleMatchCriteria{HasAttachments: boolPtr(false)},
			want: false,
		},
		{
			name: "tag absent -> rejet",
			rule: ruleMatchCriteria{HasTagID: intPtr(99)},
			want: false,
		},
		{
			name: "sujet partiel insensible casse -> match",
			rule: ruleMatchCriteria{SubjectPattern: "compteur"},
			want: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ruleMatches(tc.rule, msg)
			if got != tc.want {
				t.Errorf("ruleMatches(%+v) = %v, want %v", tc.rule, got, tc.want)
			}
		})
	}
}

// Cas messages sans tags + règle exigeant un tag : la map `nil` doit produire `false`.
func TestRuleMatches_NilTags(t *testing.T) {
	msg := messageForRules{FromAddr: "x@y.com", TagIDs: nil}
	if got := ruleMatches(ruleMatchCriteria{HasTagID: intPtr(1)}, msg); got {
		t.Errorf("attendu false quand TagIDs == nil, got true")
	}
}

// Bonus : valider la sémantique `from_pattern` (substring) avec un from au format
// `Bob <bob@example.com>`. Le `from_pattern` est une recherche substring sans extraction
// d'adresse — donc `bob@` matche bien le from complet.
func TestRuleMatches_FromPatternSubstring(t *testing.T) {
	msg := messageForRules{FromAddr: "Bob <bob@example.com>"}
	if !ruleMatches(ruleMatchCriteria{FromPattern: "bob@"}, msg) {
		t.Errorf("from_pattern substring doit matcher")
	}
	if ruleMatches(ruleMatchCriteria{FromPattern: "alice@"}, msg) {
		t.Errorf("from_pattern non présent ne doit pas matcher")
	}
}
