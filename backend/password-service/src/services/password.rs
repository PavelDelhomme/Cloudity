use uuid::Uuid;
use crate::models::password::{Password, CreatePasswordRequest};
use crate::services::encryption::EncryptionService;

pub struct PasswordService {
    encryption: EncryptionService,
}

impl PasswordService {
    pub fn new(encryption_key: &[u8; 32]) -> Self {
        Self {
            encryption: EncryptionService::new(encryption_key),
        }
    }

    pub async fn create_password(&self, request: CreatePasswordRequest) -> Result<Password, Box<dyn std::error::Error>> {
        let encrypted_password = self.encryption.encrypt(&request.password)?;
        
        let password = Password {
            id: Uuid::new_v4(),
            title: request.title,
            username: request.username,
            encrypted_password,
            url: request.url,
            notes: request.notes,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        // TODO: Save to database
        
        Ok(password)
    }

    pub async fn decrypt_password(&self, password: &Password) -> Result<String, Box<dyn std::error::Error>> {
        self.encryption.decrypt(&password.encrypted_password)
    }
}
