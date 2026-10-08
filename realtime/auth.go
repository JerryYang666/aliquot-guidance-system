package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Audiences of the two tokens the app mints with the shared secret
// (lib/server/realtime.ts): browser tickets and the app's own publish calls.
const (
	ticketAudience  = "ags-relay"
	publishAudience = "ags-relay-publish"
)

// Claims are the fields the relay reads from an HS256 JWT.
type Claims struct {
	Job      string `json:"job"`
	Subject  string `json:"sub"`
	Audience string `json:"aud"`
	Expires  int64  `json:"exp"`
}

var b64 = base64.RawURLEncoding

// Verify checks an HS256 JWT's signature, audience and expiry.
func Verify(token string, secret []byte, audience string, now time.Time) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	header, err := b64.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("malformed header")
	}
	var h struct {
		Alg string `json:"alg"`
	}
	if json.Unmarshal(header, &h) != nil || h.Alg != "HS256" {
		return nil, errors.New("unsupported algorithm")
	}
	signature, err := b64.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("malformed signature")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return nil, errors.New("bad signature")
	}
	payload, err := b64.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("malformed payload")
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, errors.New("malformed claims")
	}
	if c.Audience != audience {
		return nil, errors.New("wrong audience")
	}
	if c.Expires == 0 || now.Unix() >= c.Expires {
		return nil, errors.New("expired")
	}
	return &c, nil
}
