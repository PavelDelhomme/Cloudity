package main

import (
	"encoding/json"
	"strings"
)

// ContactProfile — fiche riche (colonne contacts.profile JSONB).
type ContactProfile struct {
	GivenName    string              `json:"given_name,omitempty"`
	FamilyName   string              `json:"family_name,omitempty"`
	MiddleName   string              `json:"middle_name,omitempty"`
	Prefix       string              `json:"prefix,omitempty"`
	Suffix       string              `json:"suffix,omitempty"`
	Nickname     string              `json:"nickname,omitempty"`
	Phonetic     string              `json:"phonetic,omitempty"`
	Organization string              `json:"organization,omitempty"`
	JobTitle     string              `json:"job_title,omitempty"`
	Department   string              `json:"department,omitempty"`
	FileAs       string              `json:"file_as,omitempty"`
	Birthday     string              `json:"birthday,omitempty"`
	Notes        string              `json:"notes,omitempty"`
	Phones       []labeledPhone      `json:"phones,omitempty"`
	Emails       []labeledValue      `json:"emails,omitempty"`
	Addresses    []contactAddress    `json:"addresses,omitempty"`
	Websites     []labeledValue      `json:"websites,omitempty"`
	Relations    []labeledValue      `json:"relations,omitempty"`
	Labels       []string            `json:"labels,omitempty"`
}

type labeledValue struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type labeledPhone struct {
	Label   string `json:"label"`
	Value   string `json:"value"`
	Country string `json:"country,omitempty"`
}

type contactAddress struct {
	Label      string `json:"label"`
	Street     string `json:"street,omitempty"`
	City       string `json:"city,omitempty"`
	PostalCode string `json:"postal_code,omitempty"`
	Region     string `json:"region,omitempty"`
	Country    string `json:"country,omitempty"`
}

func parseProfileJSON(raw []byte) ContactProfile {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == "{}" {
		return ContactProfile{}
	}
	var p ContactProfile
	_ = json.Unmarshal(raw, &p)
	return p
}

func profileToJSON(p ContactProfile) []byte {
	b, err := json.Marshal(p)
	if err != nil {
		return []byte("{}")
	}
	if len(b) == 0 {
		return []byte("{}")
	}
	return b
}

func composeDisplayName(p ContactProfile, fallbackEmail string) string {
	if s := strings.TrimSpace(p.FileAs); s != "" {
		return s
	}
	parts := []string{}
	for _, s := range []string{p.Prefix, p.GivenName, p.MiddleName, p.FamilyName, p.Suffix} {
		if t := strings.TrimSpace(s); t != "" {
			parts = append(parts, t)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}
	if s := strings.TrimSpace(p.Nickname); s != "" {
		return s
	}
	if s := strings.TrimSpace(p.Organization); s != "" {
		return s
	}
	return strings.TrimSpace(fallbackEmail)
}

func primaryEmailFromProfile(p ContactProfile, legacy string) string {
	for _, e := range p.Emails {
		v := strings.TrimSpace(strings.ToLower(e.Value))
		if strings.Contains(v, "@") {
			return v
		}
	}
	return strings.TrimSpace(strings.ToLower(legacy))
}

func primaryPhoneFromProfile(p ContactProfile, legacy string) string {
	for _, ph := range p.Phones {
		v := strings.TrimSpace(ph.Value)
		if v == "" {
			continue
		}
		if strings.HasPrefix(v, "+") {
			return v
		}
		dial := countryDial(ph.Country)
		if dial == "+33" && strings.HasPrefix(v, "0") {
			return dial + strings.ReplaceAll(v[1:], " ", "")
		}
		if dial != "" {
			return dial + strings.ReplaceAll(v, " ", "")
		}
		return v
	}
	return strings.TrimSpace(legacy)
}

func countryDial(code string) string {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "FR":
		return "+33"
	case "BE":
		return "+32"
	case "CH":
		return "+41"
	case "LU":
		return "+352"
	case "DE":
		return "+49"
	case "GB", "UK":
		return "+44"
	case "US", "CA":
		return "+1"
	case "ES":
		return "+34"
	case "IT":
		return "+39"
	default:
		return ""
	}
}

func normalizeContactFields(name, email, phone string, profile ContactProfile) (outName, outEmail, outPhone string, outProfile ContactProfile, errMsg string) {
	outProfile = profile
	outEmail = primaryEmailFromProfile(profile, email)
	outPhone = primaryPhoneFromProfile(profile, phone)
	outName = strings.TrimSpace(name)
	if outName == "" {
		outName = composeDisplayName(profile, outEmail)
	}
	if outEmail != "" && !strings.Contains(outEmail, "@") {
		return "", "", "", profile, "email invalide"
	}
	hasIdentity := outName != "" || outEmail != "" || outPhone != "" ||
		strings.TrimSpace(profile.GivenName) != "" || strings.TrimSpace(profile.FamilyName) != "" ||
		strings.TrimSpace(profile.Organization) != ""
	if !hasIdentity {
		return "", "", "", profile, "renseignez au moins un nom, un e-mail ou un téléphone"
	}
	if outName == "" {
		if outEmail != "" {
			outName = outEmail
		} else {
			outName = outPhone
		}
	}
	return outName, outEmail, outPhone, outProfile, ""
}
