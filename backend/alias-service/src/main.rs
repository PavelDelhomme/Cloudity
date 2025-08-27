use axum::{
    extract::{State, Path, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post, put, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, FromRow};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{info, warn};
use uuid::Uuid;

mod models;
mod services;
mod handlers;

use models::alias::*;
use services::generator::AliasGenerator;
use handlers::alias::*;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub generator: Arc<AliasGenerator>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    dotenv::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    let generator = Arc::new(AliasGenerator::new());
    
    let state = AppState {
        db: pool,
        generator,
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/aliases", get(list_aliases).post(create_alias))
        .route("/aliases/:id", get(get_alias).put(update_alias).delete(delete_alias))
        .route("/aliases/generate", post(generate_random_alias))
        .route("/aliases/:id/deactivate", put(deactivate_alias))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8092").await?;
    info!("🚀 Alias Service démarré sur http://0.0.0.0:8092");
    
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health_check() -> &'static str {
    "Alias Service OK"
}