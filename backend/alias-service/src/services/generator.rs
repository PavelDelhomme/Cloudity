use rand::Rng;
use regex::Regex;

pub struct AliasGenerator {
    adjectives: Vec<&'static str>,
    nouns: Vec<&'static str>,
}

impl AliasGenerator {
    pub fn new() -> Self {
        Self {
            adjectives: vec![
                "swift", "bright", "clever", "silent", "brave", "calm", "sharp", 
                "quick", "wise", "bold", "cool", "fast", "smart", "strong"
            ],
            nouns: vec![
                "fox", "wolf", "eagle", "lion", "tiger", "bear", "shark", 
                "hawk", "raven", "falcon", "panther", "lynx", "viper", "phoenix"
            ],
        }
    }

    pub fn generate_random(&self, domain: &str) -> String {
        let mut rng = rand::thread_rng();
        let random_num: u32 = rng.gen_range(100..9999);
        format!("{}{:04}@{}", 
            self.generate_random_string(8), 
            random_num, 
            domain
        )
    }

    pub fn generate_thematic(&self, theme: &str, domain: &str) -> String {
        let mut rng = rand::thread_rng();
        let adj = self.adjectives[rng.gen_range(0..self.adjectives.len())];
        let noun = self.nouns[rng.gen_range(0..self.nouns.len())];
        let num: u32 = rng.gen_range(10..99);
        
        format!("{}-{}-{}{}@{}", theme, adj, noun, num, domain)
    }

    pub fn generate_sequential(&self, base: &str, domain: &str, count: i32) -> String {
        format!("{}{}@{}", base, count + 1, domain)
    }

    fn generate_random_string(&self, length: usize) -> String {
        use rand::distributions::Alphanumeric;
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(length)
            .map(char::from)
            .collect::<String>()
            .to_lowercase()
    }

    pub fn validate_email(&self, email: &str) -> bool {
        let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
        email_regex.is_match(email)
    }
}