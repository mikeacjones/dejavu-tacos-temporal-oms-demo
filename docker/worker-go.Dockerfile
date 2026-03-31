FROM golang:1.23-alpine AS build

WORKDIR /app
COPY workflows/go/ .
RUN go mod download
RUN CGO_ENABLED=0 go build -o /worker ./cmd/worker/

FROM alpine:latest
COPY --from=build /worker /worker

CMD ["/worker"]
