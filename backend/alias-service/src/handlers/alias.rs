use axum::{
    extract::{State, Path, Query},
    http::StatusCode,
    response::Json,
};
use uuid::Uuid;
use chrono::{Duration, Utc};

use crate::{AppState, models::alias::*};

pub async fn create_alias(
    State(state): State<AppState>,
    Json(request): Json<CreateAliasRequest>,
) -> Result<Json<GeneratedAliasResponse>, StatusCode> {
    // TODO: Récupérer tenant_id et user_id depuis le token JWT
    let tenant_id = Uuid::new_v4(); // Temporaire
    let user_id = Uuid::new_v4(); // Temporaire
    
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

    let alias = sqlx::query_as::<_, EmailAlias>(
        r#"
        INSERT INTO email_aliases 
        (tenant_id, user_id, source_email, destination_email, domain, alias_type, 
         description, max_usage, expires_at, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#
    )
    .bind(tenant_id)
    .bind(user_id)
    .bind(&source_email)
    .bind(&request.destination_email)
    .bind(domain)
    .bind(&alias_type)
    .bind(&request.description)
    .bind(request.max_usage)
    .bind(expires_at)
    .bind(tags_json)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(GeneratedAliasResponse {
        full_email: source_email.clone(),
        alias,
    }))
}

pub async fn list_aliases(
    State(state): State<AppState>,
    Query(query): Query<ListAliasQuery>,
) -> Result<Json<Vec<EmailAlias>>, StatusCode> {
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = query.page.unwrap_or(0) * limit;

    let mut sql = "SELECT * FROM email_aliases WHERE 1=1".to_string();
    
    if query.active_only.unwrap_or(false) {
        sql.push_str(" AND is_active = true");
    }
    
    if let Some(alias_type) = &query.alias_type {
        sql.push_str(&format!(" AND alias_type = '{}'", alias_type));
    }
    
    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", limit, offset));

    let aliases = sqlx::query_as::<_, EmailAlias>(&sql)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(aliases))
}

pub async fn get_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<EmailAlias>, StatusCode> {
    let alias = sqlx::query_as::<_, EmailAlias>(
        "SELECT * FROM email_aliases WHERE id = $1"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(alias))
}

pub async fn update_alias(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateAliasRequest>,
) -> Result<Json<EmailAlias>, StatusCode> {
    let alias = sqlx::query_as::<_, EmailAlias>(
        r#"
        UPDATE email_aliases 
        SET description = COALESCE($2, description),
            max_usage = COALESCE($3, max_usage),
            expires_at = COALESCE($4, expires_at),
            is_active = COALESCE($5, is_active),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        "#
    )
    .bind(id)
    .bind(&request.description)
    .bind(request.max_usage)
    .bind(request.expires_at)
    .bind(request.is_active)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(alias))
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
    let alias = sqlx::query_as::<_, EmailAlias>(
        "UPDATE email_aliases SET is_active = false WHERE id = $1 RETURNING *"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(Json(alias))
}

pub async fn generate_random_alias(
    State(state): State<AppState>,
) -> Result<Json<String>, StatusCode> {
    let domain = "alias.delhomme.ovh";
    let alias = state.generator.generate_random(domain);
    Ok(Json(alias))
}