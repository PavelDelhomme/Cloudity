use axum::{
    extract::{State, Path, Query},
    http::StatusCode,
    response::Json,
};
use uuid::Uuid;
use chrono::{Duration, Utc};
use serde_json::json;

use crate::{AppState, models::alias::*};

pub async fn create_alias(
    State(state): State<AppState>,
    Json(request): Json<CreateAliasRequest>,
) -> Result<Json<GeneratedAliasResponse>, StatusCode> {
    let tenant_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();
    
    let domain = "alias.delhomme.ovh";
    let alias_type = request.alias_type.unwrap_or_else(|| "random".to_string());
    
    let source_email = match alias_type.as_str() {
        "random" => state.generator.generate_random(domain),
        "thematic" => state.generator.generate_thematic("shop", domain),
        _ => state.generator.generate_random(domain),
    };

    let expires_at = request.expires_in_days.map(|days| {
        Utc::now() + Duration::days(days as i64)
    });

    let tags_json = serde_json::to_value(request.tags.unwrap_or_default()).unwrap();

    // ✅ Utiliser query() au lieu de query!()
    let result = sqlx::query(
        r#"
        INSERT INTO email_aliases 
        (id, tenant_id, user_id, source_email, destination_email, domain, alias_type, 
         description, max_usage, expires_at, tags, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        "#
    )
    .bind(Uuid::new_v4())
    .bind(tenant_id)
    .bind(user_id)
    .bind(&source_email)
    .bind(&request.destination_email)
    .bind(domain)
    .bind(&alias_type)
    .bind(&request.description)
    .bind(request.max_usage)
    .bind(expires_at)
    .bind(&tags_json)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Créer la structure de réponse manuellement
    let alias = EmailAlias {
        id: Uuid::new_v4(),
        tenant_id: Some(tenant_id),
        user_id: Some(user_id),
        source_email: source_email.clone(),
        destination_email: request.destination_email,
        domain: domain.to_string(),
        alias_type,
        description: request.description,
        is_active: true,
        usage_count: 0,
        max_usage: request.max_usage,
        expires_at,
        tags: tags_json,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    Ok(Json(GeneratedAliasResponse {
        full_email: source_email,
        alias,
    }))
}

pub async fn list_aliases(
    State(state): State<AppState>,
    Query(query): Query<ListAliasQuery>,
) -> Result<Json<Vec<EmailAlias>>, StatusCode> {
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = query.page.unwrap_or(0) * limit;

    // ✅ Version simplifiée sans query_as!()
    let rows = sqlx::query(
        r#"
        SELECT id, tenant_id, user_id, source_email, destination_email, domain,
               alias_type, description, is_active, usage_count, max_usage, 
               expires_at, tags, created_at, updated_at
        FROM email_aliases 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
        "#
    )
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let aliases: Vec<EmailAlias> = rows.into_iter().map(|row| {
        EmailAlias {
            id: row.get("id"),
            tenant_id: row.get("tenant_id"),
            user_id: row.get("user_id"),
            source_email: row.get("source_email"),
            destination_email: row.get("destination_email"),
            domain: row.get("domain"),
            alias_type: row.get("alias_type"),
            description: row.get("description"),
            is_active: row.get("is_active"),
            usage_count: row.get("usage_count"),
            max_usage: row.get("max_usage"),
            expires_at: row.get("expires_at"),
            tags: row.get("tags"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }).collect();

    Ok(Json(aliases))
}

pub async fn get_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<EmailAlias>, StatusCode> {
    let row = sqlx::query(
        r#"
        SELECT id, tenant_id, user_id, source_email, destination_email, domain,
               alias_type, description, is_active, usage_count, max_usage, 
               expires_at, tags, created_at, updated_at
        FROM email_aliases WHERE id = $1
        "#
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    let alias = EmailAlias {
        id: row.get("id"),
        tenant_id: row.get("tenant_id"),
        user_id: row.get("user_id"),
        source_email: row.get("source_email"),
        destination_email: row.get("destination_email"),
        domain: row.get("domain"),
        alias_type: row.get("alias_type"),
        description: row.get("description"),
        is_active: row.get("is_active"),
        usage_count: row.get("usage_count"),
        max_usage: row.get("max_usage"),
        expires_at: row.get("expires_at"),
        tags: row.get("tags"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };

    Ok(Json(alias))
}

pub async fn update_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateAliasRequest>,
) -> Result<Json<EmailAlias>, StatusCode> {
    sqlx::query(
        r#"
        UPDATE email_aliases 
        SET description = COALESCE($2, description),
            max_usage = COALESCE($3, max_usage),
            expires_at = COALESCE($4, expires_at),
            is_active = COALESCE($5, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#
    )
    .bind(id)
    .bind(&request.description)
    .bind(request.max_usage)
    .bind(request.expires_at)
    .bind(request.is_active)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    // Récupérer l'alias mis à jour
    get_alias(State(state), Path(id)).await
}

pub async fn delete_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM email_aliases WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn deactivate_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<EmailAlias>, StatusCode> {
    sqlx::query(
        "UPDATE email_aliases SET is_active = false, updated_at = NOW() WHERE id = $1"
    )
    .bind(id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    // Récupérer l'alias mis à jour
    get_alias(State(state), Path(id)).await
}

pub async fn generate_random_alias(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let domain = "alias.delhomme.ovh";
    let alias = state.generator.generate_random(domain);
    Ok(Json(json!({"suggested_alias": alias})))
}
