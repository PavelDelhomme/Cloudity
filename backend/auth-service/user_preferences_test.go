package main

import (
	"testing"
)

func TestDeepMergeJSON_nestedApps(t *testing.T) {
	base := map[string]any{
		"theme": map[string]any{
			"default": "system",
			"apps": map[string]any{
				"pass": "light",
			},
		},
		"pass": map[string]any{
			"clipboardClearMs": float64(30_000),
		},
	}
	patch := map[string]any{
		"theme": map[string]any{
			"apps": map[string]any{
				"pass": "dark",
				"mail": "system",
			},
		},
		"pass": map[string]any{
			"totpAutoCopy": true,
		},
	}
	merged := deepMergeJSON(base, patch)
	theme, ok := merged["theme"].(map[string]any)
	if !ok {
		t.Fatal("theme missing")
	}
	if theme["default"] != "system" {
		t.Fatalf("default theme overwritten: %v", theme["default"])
	}
	apps, ok := theme["apps"].(map[string]any)
	if !ok {
		t.Fatal("apps missing")
	}
	if apps["pass"] != "dark" || apps["mail"] != "system" {
		t.Fatalf("apps merge failed: %v", apps)
	}
	pass, ok := merged["pass"].(map[string]any)
	if !ok {
		t.Fatal("pass missing")
	}
	if pass["clipboardClearMs"] != float64(30_000) {
		t.Fatalf("clipboardClearMs lost: %v", pass["clipboardClearMs"])
	}
	if pass["totpAutoCopy"] != true {
		t.Fatalf("totpAutoCopy not merged: %v", pass["totpAutoCopy"])
	}
}
