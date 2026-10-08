# Built for linux/amd64 and linux/arm64 (e.g. Graviton) by
# .github/workflows/relay-image.yml. The build stage runs on the builder's
# own platform and cross-compiles, which Go does natively, so no emulation.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /relay .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /relay /relay
EXPOSE 8081
ENTRYPOINT ["/relay"]
