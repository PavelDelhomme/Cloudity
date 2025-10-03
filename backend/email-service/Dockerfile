# backend/email-service/Dockerfile - CORRIGÉ POUR CARGO VERSION
FROM rust:1.82-alpine AS builder

WORKDIR /app

# Installation des dépendances système
RUN apk add --no-cache \
    musl-dev \
    openssl-dev \
    pkgconfig \
    git

# Copie des fichiers de configuration Cargo
COPY Cargo.toml ./

# SUPPRESSION DE Cargo.lock - sera régénéré automatiquement
# Cela évite les problèmes de version de lock file

# Création d'un projet temporaire pour mettre en cache les dépendances
# CORRIGÉ : Pas de cargo build --release sans le vrai src/
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo fetch && \
    rm -rf src

# Copie du code source
COPY src/ ./src/

# Build du projet
RUN cargo build --release

# Stage de production
FROM alpine:latest

# Installation des dépendances runtime
RUN apk add --no-cache \
    libgcc \
    openssl \
    ca-certificates

WORKDIR /app

# Copie du binaire depuis le builder
COPY --from=builder /app/target/release/email-service /app/email-service

# Configuration par défaut
ENV PORT=8091
ENV RUST_LOG=info

# Exposition du port
EXPOSE 8091

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8091/health || exit 1

# Commande de démarrage
CMD ["./email-service"]