package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"testing"
	"time"
)

var testSecret = []byte("test-secret-test-secret-test-secret-0123")

func sign(t *testing.T, secret []byte, header, claims map[string]any) string {
	t.Helper()
	h, _ := json.Marshal(header)
	c, _ := json.Marshal(claims)
	unsigned := b64.EncodeToString(h) + "." + b64.EncodeToString(c)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(unsigned))
	return unsigned + "." + b64.EncodeToString(mac.Sum(nil))
}

func ticket(t *testing.T, job, audience string, expires time.Time) string {
	return sign(t, testSecret, map[string]any{"alg": "HS256"}, map[string]any{
		"job": job, "sub": "participant-1", "aud": audience, "exp": expires.Unix(),
	})
}

func TestVerify(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	later := now.Add(time.Minute)

	if c, err := Verify(ticket(t, "job-1", ticketAudience, later), testSecret, ticketAudience, now); err != nil || c.Job != "job-1" || c.Subject != "participant-1" {
		t.Fatalf("valid ticket rejected: %v %+v", err, c)
	}

	cases := map[string]string{
		"expired":         ticket(t, "job-1", ticketAudience, now),
		"wrong audience":  ticket(t, "job-1", publishAudience, later),
		"wrong secret":    sign(t, []byte("another-secret-another-secret-0123456"), map[string]any{"alg": "HS256"}, map[string]any{"job": "j", "aud": ticketAudience, "exp": later.Unix()}),
		"alg none":        sign(t, testSecret, map[string]any{"alg": "none"}, map[string]any{"job": "j", "aud": ticketAudience, "exp": later.Unix()}),
		"no expiry":       sign(t, testSecret, map[string]any{"alg": "HS256"}, map[string]any{"job": "j", "aud": ticketAudience}),
		"malformed":       "not.a.jwt",
		"too few parts":   "abc",
		"tampered claims": tamper(ticket(t, "job-1", ticketAudience, later)),
	}
	for name, token := range cases {
		if _, err := Verify(token, testSecret, ticketAudience, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

// tamper swaps the claims for another job's while keeping the signature.
func tamper(token string) string {
	other, _ := json.Marshal(map[string]any{"job": "job-2", "aud": ticketAudience, "exp": 1_900_000_000})
	parts := splitToken(token)
	return parts[0] + "." + b64.EncodeToString(other) + "." + parts[2]
}

func splitToken(token string) [3]string {
	var parts [3]string
	i := 0
	for _, ch := range token {
		if ch == '.' {
			i++
			continue
		}
		parts[i] += string(ch)
	}
	return parts
}
