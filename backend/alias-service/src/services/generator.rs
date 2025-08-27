use rand::Rng;

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

    fn generate_random_string(&self, length: usize) -> String {
        use rand::distributions::Alphanumeric;
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(length)
            .map(char::from)
            .collect::<String>()
            .to_lowercase()
    }
}