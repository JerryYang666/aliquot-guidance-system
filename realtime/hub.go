package main

import (
	"sync"
)

// Hub tracks which sockets are watching which job and fans messages out.
// Membership lives in memory only; a restarted relay loses nothing that
// matters, because screens refetch their state when they reconnect.
type Hub struct {
	mu   sync.RWMutex
	jobs map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{jobs: make(map[string]map[*Client]struct{})}
}

func (h *Hub) Add(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.jobs[c.job]
	if set == nil {
		set = make(map[*Client]struct{})
		h.jobs[c.job] = set
	}
	set[c] = struct{}{}
}

func (h *Hub) Remove(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.jobs[c.job]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.jobs, c.job)
		}
	}
}

// Publish queues a message for every socket on the job and returns how many
// received it. A socket too slow to keep up is closed; it will reconnect and
// refetch.
func (h *Hub) Publish(job string, message []byte) int {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.jobs[job]))
	for c := range h.jobs[job] {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	delivered := 0
	for _, c := range clients {
		if c.Enqueue(message) {
			delivered++
		}
	}
	return delivered
}

// Counts reports sockets and jobs, for /health.
func (h *Hub) Counts() (sockets, jobs int) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, set := range h.jobs {
		sockets += len(set)
	}
	return sockets, len(h.jobs)
}
