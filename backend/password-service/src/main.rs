use axum::{routing::get, Router};
use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::init();
    
    let app = Router::new()
        .route("/health", get(|| async { "Password Service OK" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8093").await?;
    info!("🚀 Password Service démarré sur http://0.0.0.0:8093");
    
    axum::serve(listener, app).await?;
    Ok(())
}