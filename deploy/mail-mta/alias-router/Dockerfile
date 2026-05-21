FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/alias-router .

FROM alpine:3.22
RUN adduser -D -H -u 10001 aliasrouter
USER aliasrouter
COPY --from=build /out/alias-router /usr/local/bin/alias-router
EXPOSE 2527
ENTRYPOINT ["/usr/local/bin/alias-router"]
