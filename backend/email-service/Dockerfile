# backend/email-service/Dockerfile - Email Service Rust
FROM rust:1.75-alpine AS builder

WORKDIR /app

# Installation des dépendances système
RUN apk add --no-cache \
    musl-dev \
    openssl-dev \
    pkgconfig \
    git

# Copie des fichiers de configuration Cargo
COPY Cargo.toml Cargo.lock ./

# Création d'un projet temporaire pour mettre en cache les dépendances
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copie du code source réel
COPY src ./src

# Build de l'application
RUN cargo build --release

# Image de production
FROM alpine:latest

WORKDIR /app

# Installation des dépendances runtime
RUN apk add --no-cache \
    ca-certificates \
    openssl

# Copie de l'exécutable depuis le builder
COPY --from=builder /app/target/release/email-service /app/email-service

# Création d'un utilisateur non-root
RUN addgroup -g 1000 emailservice && \
    adduser -D -s /bin/sh -u 1000 -G emailservice emailservice

# Changement vers l'utilisateur non-root
USER emailservice

EXPOSE 8091

CMD ["./email-service"]