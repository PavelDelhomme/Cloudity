FROM rust:1.95-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install cargo-watch

COPY Cargo.toml ./
RUN cargo fetch

COPY . .

EXPOSE 8093

CMD ["cargo", "watch", "-x", "run"]