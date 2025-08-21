
// Repository pour l'authentification
type AuthRepository struct {
	db *Database
}

func NewAuthRepository(db *Database) *AuthRepository {
	return &AuthRepository{db: db}
}

func (r *AuthRepository) AuthenticateUser(ctx context.Context, email, password string, tenantID *uuid.UUID) (*User, *Tenant, error) {
	var user User
	var tenant Tenant

	query := `
		SELECT 
			tu.user_id, tu.tenant_id, tu.email, tu.first_name, tu.last_name, 
			tu.role, tu.is_active, tu.created_at,
			t.tenant_id, t.name, t.domain, t.subscription_tier, t.status, t.created_at
		FROM tenant_users tu
		JOIN tenants t ON tu.tenant_id = t.tenant_id
		WHERE tu.email = $1
		AND tu.password_hash = crypt($2, tu.password_hash)
		AND tu.is_active = TRUE
		AND tu.deleted_at IS NULL
		AND t.status = 'active'
		AND t.deleted_at IS NULL`

	args := []interface{}{email, password}

	if tenantID != nil {
		query += " AND tu.tenant_id = $3"
		args = append(args, tenantID.String())
	}

	row := r.db.db.QueryRowContext(ctx, query, args...)

	err := row.Scan(
		&user.ID, &user.TenantID, &user.Email, &user.FirstName, &user.LastName,
		&user.Role, &user.IsActive, &user.CreatedAt,
		&tenant.ID, &tenant.Name, &tenant.Domain, &tenant.SubscriptionTier,
		&tenant.Status, &tenant.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, fmt.Errorf("invalid credentials")
		}
		return nil, nil, err
	}

	return &user, &tenant, nil
}

func (r *AuthRepository) GetUsersByTenant(ctx context.Context, tenantID uuid.UUID) ([]User, error) {
	var users []User

	err := r.db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `
			SELECT user_id, tenant_id, email, first_name, last_name, role, is_active, created_at
			FROM tenant_users
			WHERE deleted_at IS NULL
			ORDER BY created_at ASC
		`)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var user User
			err := rows.Scan(
				&user.ID, &user.TenantID, &user.Email, &user.FirstName,
				&user.LastName, &user.Role, &user.IsActive, &user.CreatedAt,
			)
			if err != nil {
				return err
			}
			users = append(users, user)
		}

		return rows.Err()
	})

	return users, err
}