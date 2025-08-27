use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EmailAlias {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub source_email: String,
    pub destination_email: String,
    pub domain: String,
    pub alias_type: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub usage_count: i32,
    pub max_usage: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub tags: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAliasRequest {
    pub destination_email: String,
    pub alias_type: Option<String>,
    pub description: Option<String>,
    pub max_usage: Option<i32>,
    pub expires_in_days: Option<i32>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAliasRequest {
    pub description: Option<String>,
    pub max_usage: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ListAliasQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
    pub alias_type: Option<String>,
    pub active_only: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct GeneratedAliasResponse {
    pub alias: EmailAlias,
    pub full_email: String,
}