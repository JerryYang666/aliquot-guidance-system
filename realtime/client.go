package main

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 25 * time.Second
	sendBuffer = 64
	// Browsers only answer pings; anything larger is not ours.
	maxIncoming = 512
)

// Client is one browser socket watching one job.
type Client struct {
	job         string
	participant string
	conn        *websocket.Conn
	send        chan []byte
	closeOnce   sync.Once
	done        chan struct{}
}

func NewClient(job, participant string, conn *websocket.Conn) *Client {
	return &Client{
		job:         job,
		participant: participant,
		conn:        conn,
		send:        make(chan []byte, sendBuffer),
		done:        make(chan struct{}),
	}
}

// Enqueue hands a message to the writer without blocking the publisher.
func (c *Client) Enqueue(message []byte) bool {
	select {
	case <-c.done:
		return false
	default:
	}
	select {
	case c.send <- message:
		return true
	default:
		c.Close()
		return false
	}
}

func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.conn.Close()
	})
}

// Run serves the socket until it closes: one goroutine reads (to notice
// pongs and disconnects), this one writes.
func (c *Client) Run(hub *Hub, hello []byte) {
	hub.Add(c)
	defer hub.Remove(c)
	defer c.Close()

	go c.readLoop()

	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	if !c.write(websocket.TextMessage, hello) {
		return
	}
	for {
		select {
		case <-c.done:
			return
		case message := <-c.send:
			if !c.write(websocket.TextMessage, message) {
				return
			}
		case <-ticker.C:
			if !c.write(websocket.PingMessage, nil) {
				return
			}
		}
	}
}

func (c *Client) write(kind int, data []byte) bool {
	_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
	return c.conn.WriteMessage(kind, data) == nil
}

func (c *Client) readLoop() {
	defer c.Close()
	c.conn.SetReadLimit(maxIncoming)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}
