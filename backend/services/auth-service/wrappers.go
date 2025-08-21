
// Database wrapper avec support RLS
type Database struct {
	db *sql.DB
}

func NewDatabase(databaseURL string) (*Database, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &Database{db: db}, nil
}

func (d *Database) Close() error {
	return d.db.Close()
}

// Exécuter une requête avec contexte tenant
func (d *Database) WithTenant(ctx context.Context, tenantID uuid.UUID, fn func(*sql.Tx) error) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Définir le tenant courant pour RLS
	_, err = tx.ExecContext(ctx, "SET LOCAL app.current_tenant = $1", tenantID.String())
	if err != nil {
		return fmt.Errorf("failed to set tenant context: %w", err)
	}

	// Utiliser le rôle application (non-superuser)
	_, err = tx.ExecContext(ctx, "SET LOCAL ROLE cloudity_app")
	if err != nil {
		return fmt.Errorf("failed to set application role: %w", err)
	}

	err = fn(tx)
	if err != nil {
		return err
	}

	return tx.Commit()
}