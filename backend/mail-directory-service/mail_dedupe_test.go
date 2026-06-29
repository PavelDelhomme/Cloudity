package main

import "testing"

func TestDedupeMailMessagesAfterSyncNilDB(t *testing.T) {
	h := &Handler{}
	h.dedupeMailMessagesAfterSync(nil, 1)
}
