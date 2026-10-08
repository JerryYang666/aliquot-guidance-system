package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func newTestServer(t *testing.T, origins ...string) (*httptest.Server, *Hub) {
	t.Helper()
	hub := NewHub()
	srv := httptest.NewServer(NewServer(hub, testSecret, origins).Routes())
	t.Cleanup(srv.Close)
	return srv, hub
}

func dial(t *testing.T, srv *httptest.Server, job string, header http.Header) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?ticket=" + ticket(t, job, ticketAudience, time.Now().Add(time.Minute))
	conn, _, err := websocket.DefaultDialer.Dial(url, header)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	var hello map[string]string
	if err := conn.ReadJSON(&hello); err != nil || hello["type"] != "hello" || hello["job"] != job {
		t.Fatalf("hello: %v %v", err, hello)
	}
	return conn
}

func publish(t *testing.T, srv *httptest.Server, bearer, body string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/publish", strings.NewReader(body))
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = res.Body.Close() })
	return res
}

func publishToken(t *testing.T) string {
	return ticket(t, "", publishAudience, time.Now().Add(time.Minute))
}

func TestPublishReachesOnlyThatJob(t *testing.T) {
	srv, hub := newTestServer(t)
	a1 := dial(t, srv, "job-a", nil)
	a2 := dial(t, srv, "job-a", nil)
	b := dial(t, srv, "job-b", nil)
	waitFor(t, func() bool { s, _ := hub.Counts(); return s == 3 })

	res := publish(t, srv, publishToken(t), `{"job":"job-a","message":{"type":"change","version":7}}`)
	var out map[string]int
	_ = json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode != http.StatusOK || out["delivered"] != 2 {
		t.Fatalf("publish: %d %v", res.StatusCode, out)
	}
	for _, conn := range []*websocket.Conn{a1, a2} {
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var msg map[string]any
		if err := conn.ReadJSON(&msg); err != nil || msg["version"] != float64(7) {
			t.Fatalf("job-a socket: %v %v", err, msg)
		}
	}
	_ = b.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	if _, _, err := b.ReadMessage(); err == nil {
		t.Fatal("job-b socket received job-a's message")
	}
}

func TestSocketNeedsAValidTicket(t *testing.T) {
	srv, _ := newTestServer(t)
	base := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?ticket="
	for name, tk := range map[string]string{
		"none":    "",
		"expired": ticket(t, "job-a", ticketAudience, time.Now().Add(-time.Second)),
		"publish": publishToken(t),
	} {
		_, res, err := websocket.DefaultDialer.Dial(base+tk, nil)
		if err == nil || res == nil || res.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s ticket: want 401, got %v", name, err)
		}
	}
}

func TestPublishNeedsTheAppsBearer(t *testing.T) {
	srv, _ := newTestServer(t)
	body := `{"job":"job-a","message":{}}`
	if res := publish(t, srv, "", body); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("no bearer: %d", res.StatusCode)
	}
	browserTicket := ticket(t, "job-a", ticketAudience, time.Now().Add(time.Minute))
	if res := publish(t, srv, browserTicket, body); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("browser ticket as bearer: %d", res.StatusCode)
	}
	if res := publish(t, srv, publishToken(t), `{"job":""}`); res.StatusCode != http.StatusBadRequest {
		t.Errorf("bad body: %d", res.StatusCode)
	}
}

func TestOriginAllowList(t *testing.T) {
	srv, _ := newTestServer(t, "https://aliquot.example.org")
	dial(t, srv, "job-a", http.Header{"Origin": {"https://aliquot.example.org"}})
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?ticket=" + ticket(t, "job-a", ticketAudience, time.Now().Add(time.Minute))
	if _, _, err := websocket.DefaultDialer.Dial(url, http.Header{"Origin": {"https://evil.example"}}); err == nil {
		t.Fatal("foreign origin accepted")
	}
}

func TestDisconnectLeavesTheHub(t *testing.T) {
	srv, hub := newTestServer(t)
	conn := dial(t, srv, "job-a", nil)
	waitFor(t, func() bool { s, _ := hub.Counts(); return s == 1 })
	_ = conn.Close()
	waitFor(t, func() bool { s, j := hub.Counts(); return s == 0 && j == 0 })
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
