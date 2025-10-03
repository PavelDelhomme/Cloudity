use axum::{
    extract::Path,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber;

#[derive(Serialize, Deserialize)]
struct PasswordEntry {
    id: String,
    title: String,
    username: String,
    encrypted_password: String,
    url: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize)]
struct CreatePasswordRequest {
    title: String,
    username: String,
    password: String,
    url: Option<String>,
    notes: Option<String>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "password-service".to_string(),
    })
}

async fn list_passwords() -> Json<Vec<PasswordEntry>> {
    // Mock data for now
    let passwords = vec![
        PasswordEntry {
            id: "1".to_string(),
            title: "Gmail".to_string(),
            username: "user@gmail.com".to_string(),
            encrypted_password: "encrypted_data".to_string(),
            url: Some("https://gmail.com".to_string()),
            notes: None,
        },
    ];
    Json(passwords)
}

async fn create_password(Json(payload): Json<CreatePasswordRequest>) -> Result<Json<PasswordEntry>, StatusCode> {
    // Mock implementation
    let password_entry = PasswordEntry {
        id: uuid::Uuid::new_v4().to_string(),
        title: payload.title,
        username: payload.username,
        encrypted_password: "encrypted_".to_string() + &payload.password,
        url: payload.url,
        notes: payload.notes,
    };
    
    Ok(Json(password_entry))
}

async fn get_password(Path(id): Path<String>) -> Result<Json<PasswordEntry>, StatusCode> {
    // Mock implementation
    if id == "1" {
        Ok(Json(PasswordEntry {
            id: "1".to_string(),
            title: "Gmail".to_string(),
            username: "user@gmail.com".to_string(),
            encrypted_password: "encrypted_data".to_string(),
            url: Some("https://gmail.com".to_string()),
            notes: None,
        }))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::init();

    let app = Router::new()
        .route("/health", get(health))
        .route("/passwords", get(list_passwords))
        .route("/passwords", post(create_password))
        .route("/passwords/:id", get(get_password))
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive())
        );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8093").await.unwrap();
    println!("🔒 Password Service running on http://0.0.0.0:8093");
    
    axum::serve(listener, app).await.unwrap();
}