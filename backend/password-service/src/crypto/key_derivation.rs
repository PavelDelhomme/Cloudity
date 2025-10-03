use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand::rngs::OsRng;

pub fn hash_password(password: &str) -> Result<String, Box<dyn std::error::Error>> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    
    let password_hash = argon2.hash_password(password.as_bytes(), &salt)?;
    
    Ok(password_hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, Box<dyn std::error::Error>> {
    let parsed_hash = PasswordHash::new(hash)?;
    let argon2 = Argon2::default();
    
    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

pub fn derive_key_from_password(password: &str, salt: &[u8]) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    use argon2::{Argon2, password_hash::{PasswordHasher, SaltString}};
    
    let salt_string = SaltString::encode_b64(salt)?;
    let argon2 = Argon2::default();
    
    let hash = argon2.hash_password(password.as_bytes(), &salt_string)?;
    let hash_bytes = hash.hash.unwrap().as_bytes();
    
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash_bytes[..32]);
    
    Ok(key)
}
