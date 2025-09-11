# backend/email-service/src/main.rs - Service Email Rust de Base
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    db: PgPool,
}

#[derive(Serialize, Deserialize)]
pub struct EmailMessage {
    pub id: Option<Uuid>,
    pub from_addr: String,
    pub to_addr: String,
    pub subject: String,
    pub body: String,
    pub html_body: Option<String>,
    pub folder: String,
    pub is_read: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize, Deserialize)]
pub struct EmailAlias {
    pub id: Option<Uuid>,
    pub alias: String,
    pub target_email: String,
    pub is_active: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    status: String,
    service: String,
    timestamp: chrono::DateTime<chrono::Utc>,
    version: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Configuration du tracing
    tracing_subscriber::fmt::init();

    // Chargement des variables d'environnement
    dotenv::dotenv().ok();
    
    // Configuration de la base de données
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://cloudity_admin:cloudity_secure_password_2025@postgres:5432/cloudity".to_string());
    
    info!("🔗 Connexion à la base de données...");
    let db = PgPool::connect(&database_url).await?;
    
    // Test de connexion
    sqlx::query("SELECT 1").fetch_one(&db).await?;
    info!("✅ Base de données connectée");

    let app_state = Arc::new(AppState { db });

    // Configuration des routes
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/emails", get(get_emails).post(send_email))
        .route("/api/v1/emails/:id", get(get_email))
        .route("/api/v1/aliases", get(get_aliases).post(create_alias))
        .route("/api/v1/folders", get(get_folders))
        .layer(
            ServiceBuilder::new()
                .layer(CorsLayer::permissive())
                .into_inner(),
        )
        .with_state(app_state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8091".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    info!("🚀 Email Service démarrage sur {}", addr);
    let listener = TcpListener::bind(&addr).await?;
    
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy".to_string(),
        service: "email-service".to_string(),
        timestamp: chrono::Utc::now(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn get_emails(State(state): State<Arc<AppState>>) -> Result<Json<Vec<EmailMessage>>, StatusCode> {
    info!("📧 Récupération des emails");
    
    let emails = sqlx::query(
        "SELECT id, from_addr, to_addr, subject, body, html_body, folder, is_read, created_at 
         FROM emails 
         ORDER BY created_at DESC 
         LIMIT 50"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        warn!("❌ Erreur récupération emails: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let email_messages: Vec<EmailMessage> = emails
        .into_iter()
        .map(|row| EmailMessage {
            id: row.get("id"),
            from_addr: row.get("from_addr"),
            to_addr: row.get("to_addr"),
            subject: row.get("subject"),
            body: row.get("body"),
            html_body: row.get("html_body"),
            folder: row.get("folder"),
            is_read: row.get("is_read"),
            created_at: row.get("created_at"),
        })
        .collect();

    info!("✅ {} emails récupérés", email_messages.len());
    Ok(Json(email_messages))
}

async fn get_email(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<EmailMessage>, StatusCode> {
    info!("📧 Récupération email ID: {}", id);
    
    let email = sqlx::query(
        "SELECT id, from_addr, to_addr, subject, body, html_body, folder, is_read, created_at 
         FROM emails 
         WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        warn!("❌ Erreur récupération email: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match email {
        Some(row) => {
            let email_message = EmailMessage {
                id: row.get("id"),
                from_addr: row.get("from_addr"),
                to_addr: row.get("to_addr"),
                subject: row.get("subject"),
                body: row.get("body"),
                html_body: row.get("html_body"),
                folder: row.get("folder"),
                is_read: row.get("is_read"),
                created_at: row.get("created_at"),
            };
            info!("✅ Email trouvé");
            Ok(Json(email_message))
        }
        None => {
            warn!("⚠️ Email non trouvé: {}", id);
            Err(StatusCode::NOT_FOUND)
        }
    }
}

async fn send_email(
    State(state): State<Arc<AppState>>,
    Json(email): Json<EmailMessage>,
) -> Result<Json<EmailMessage>, StatusCode> {
    info!("📤 Envoi email de {} à {}", email.from_addr, email.to_addr);
    
    // Résolution d'alias (basique pour le moment)
    let resolved_to = resolve_email_alias(&state.db, &email.to_addr).await
        .unwrap_or_else(|_| email.to_addr.clone());

    // Sauvegarde en base de données
    let saved_email = sqlx::query(
        "INSERT INTO emails (from_addr, to_addr, subject, body, html_body, folder, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, from_addr, to_addr, subject, body, html_body, folder, is_read, created_at"
    )
    .bind(&email.from_addr)
    .bind(&resolved_to)
    .bind(&email.subject)
    .bind(&email.body)
    .bind(&email.html_body)
    .bind("sent")
    .bind(false)
    .bind(chrono::Utc::now())
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        warn!("❌ Erreur sauvegarde email: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result = EmailMessage {
        id: saved_email.get("id"),
        from_addr: saved_email.get("from_addr"),
        to_addr: saved_email.get("to_addr"),
        subject: saved_email.get("subject"),
        body: saved_email.get("body"),
        html_body: saved_email.get("html_body"),
        folder: saved_email.get("folder"),
        is_read: saved_email.get("is_read"),
        created_at: saved_email.get("created_at"),
    };

    info!("✅ Email sauvegardé avec ID: {:?}", result.id);
    Ok(Json(result))
}

async fn get_aliases(State(state): State<Arc<AppState>>) -> Result<Json<Vec<EmailAlias>>, StatusCode> {
    info!("🏷️ Récupération des alias");
    
    let aliases = sqlx::query(
        "SELECT id, alias, target_email, is_active, created_at 
         FROM email_aliases 
         WHERE is_active = true 
         ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        warn!("❌ Erreur récupération alias: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let email_aliases: Vec<EmailAlias> = aliases
        .into_iter()
        .map(|row| EmailAlias {
            id: row.get("id"),
            alias: row.get("alias"),
            target_email: row.get("target_email"),
            is_active: row.get("is_active"),
            created_at: row.get("created_at"),
        })
        .collect();

    info!("✅ {} alias récupérés", email_aliases.len());
    Ok(Json(email_aliases))
}

async fn create_alias(
    State(state): State<Arc<AppState>>,
    Json(alias): Json<EmailAlias>,
) -> Result<Json<EmailAlias>, StatusCode> {
    info!("🏷️ Création alias {} -> {}", alias.alias, alias.target_email);
    
    let created_alias = sqlx::query(
        "INSERT INTO email_aliases (alias, target_email, is_active, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, alias, target_email, is_active, created_at"
    )
    .bind(&alias.alias)
    .bind(&alias.target_email)
    .bind(true)
    .bind(chrono::Utc::now())
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        warn!("❌ Erreur création alias: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result = EmailAlias {
        id: created_alias.get("id"),
        alias: created_alias.get("alias"),
        target_email: created_alias.get("target_email"),
        is_active: created_alias.get("is_active"),
        created_at: created_alias.get("created_at"),
    };

    info!("✅ Alias créé avec ID: {:?}", result.id);
    Ok(Json(result))
}

async fn get_folders(State(_state): State<Arc<AppState>>) -> Json<Vec<String>> {
    Json(vec![
        "inbox".to_string(),
        "sent".to_string(),
        "drafts".to_string(),
        "trash".to_string(),
        "spam".to_string(),
    ])
}

// Fonction de résolution d'alias basique
async fn resolve_email_alias(db: &PgPool, email: &str) -> Result<String, sqlx::Error> {
    // Support des alias avec + (paul+github@delhomme.ovh -> paul@delhomme.ovh)
    if email.contains('+') && email.ends_with("@delhomme.ovh") {
        let parts: Vec<&str> = email.split('@').collect();
        if parts.len() == 2 {
            let local_parts: Vec<&str> = parts[0].split('+').collect();
            let base_email = format!("{}@{}", local_parts[0], parts[1]);
            
            // Vérifier que l'email de base est paul@delhomme.ovh
            if base_email == "paul@delhomme.ovh" {
                info!("🏷️ Résolution alias {} -> {}", email, base_email);
                return Ok(base_email);
            }
        }
    }
    
    // Vérification alias direct en base
    let target = sqlx::query_scalar!(
        "SELECT target_email FROM email_aliases WHERE alias = $1 AND is_active = true",
        email
    )
    .fetch_optional(db)
    .await?;
    
    Ok(target.unwrap_or_else(|| email.to_string()))
}