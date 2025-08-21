
// Middleware pour l'authentification et RLS
func AuthMiddleware(jwtSecret string, db *Database) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		tokenString := authHeader[7:] // Remove "Bearer "

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		// Extraire les informations du token
		userID := claims["user_id"].(string)
		tenantID := claims["tenant_id"].(string)
		role := claims["role"].(string)

		// Stocker dans le contexte
		c.Set("user_id", userID)
		c.Set("tenant_id", tenantID)
		c.Set("role", role)

		c.Next()
	}
}