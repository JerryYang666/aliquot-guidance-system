package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const maxPublishBytes = 1 << 20

// Server wires the HTTP endpoints to the hub.
type Server struct {
	hub            *Hub
	secret         []byte
	allowedOrigins map[string]bool
	now            func() time.Time
	upgrader       websocket.Upgrader
}

func NewServer(hub *Hub, secret []byte, allowedOrigins []string) *Server {
	s := &Server{hub: hub, secret: secret, allowedOrigins: map[string]bool{}, now: time.Now}
	for _, o := range allowedOrigins {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			s.allowedOrigins[o] = true
		}
	}
	s.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin:     s.checkOrigin,
	}
	return s
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", s.handleSocket)
	mux.HandleFunc("POST /publish", s.handlePublish)
	mux.HandleFunc("GET /health", s.handleHealth)
	return mux
}

// The ticket is the real gate; the origin check only stops other sites from
// opening sockets with a ticket they somehow obtained.
func (s *Server) checkOrigin(r *http.Request) bool {
	if len(s.allowedOrigins) == 0 {
		return true
	}
	return s.allowedOrigins[r.Header.Get("Origin")]
}

// handleSocket upgrades a browser that presents a valid ticket for a job.
func (s *Server) handleSocket(w http.ResponseWriter, r *http.Request) {
	claims, err := Verify(r.URL.Query().Get("ticket"), s.secret, ticketAudience, s.now())
	if err != nil || claims.Job == "" {
		http.Error(w, "invalid ticket", http.StatusUnauthorized)
		return
	}
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // the upgrader has already answered
	}
	hello, _ := json.Marshal(map[string]string{"type": "hello", "job": claims.Job})
	NewClient(claims.Job, claims.Subject, conn).Run(s.hub, hello)
}

type publishRequest struct {
	Job     string          `json:"job"`
	Message json.RawMessage `json:"message"`
}

// handlePublish fans a committed change out to the job's sockets. Only the
// app can call it: the bearer is signed with the shared secret.
func (s *Server) handlePublish(w http.ResponseWriter, r *http.Request) {
	bearer, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if _, err := Verify(bearer, s.secret, publishAudience, s.now()); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxPublishBytes+1))
	if err != nil || len(body) > maxPublishBytes {
		http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}
	var req publishRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Job == "" || len(req.Message) == 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	delivered := s.hub.Publish(req.Job, req.Message)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"delivered": delivered})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	sockets, jobs := s.hub.Counts()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "sockets": sockets, "jobs": jobs})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			log.Printf("%s %s", r.Method, r.URL.Path)
		}
		next.ServeHTTP(w, r)
	})
}
