// Command relay fans committed job changes out to every browser watching
// the job. It holds no state of its own: the app is the authority, and a
// screen that reconnects refetches. See docs/design.md ("Real-time sync").
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	secret := os.Getenv("RELAY_SECRET")
	if len(secret) < 32 {
		log.Fatal("RELAY_SECRET must be set to at least 32 characters")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	var origins []string
	if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
		origins = strings.Split(v, ",")
	}

	server := NewServer(NewHub(), []byte(secret), origins)
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           logRequests(server.Routes()),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("relay listening on :%s", port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
