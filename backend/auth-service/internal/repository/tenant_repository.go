package repository

import (
    "context"
    "errors"
    
    "github.com/PavelDelhomme/Cloudity/services/auth-service/models"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

type TenantRepository interface {
    Create(ctx context.Context, tenant *models.Tenant) error
    GetByID(ctx context.Context, tenantID uuid.UUID) (*models.Tenant, error)
    GetBySubdomain(ctx context.Context, subdomain string) (*models.Tenant, error)
    GetByDomain(ctx context.Context, domain string) (*models.Tenant, error)
    Update(ctx context.Context, tenant *models.Tenant) error
    Delete(ctx context.Context, tenantID uuid.UUID) error
    List(ctx context.Context, limit, offset int) ([]*models.Tenant, error)
}

type tenantRepository struct {
    db *gorm.DB
}

func NewTenantRepository(db *gorm.DB) TenantRepository {
    return &tenantRepository{db: db}
}

func (r *tenantRepository) Create(ctx context.Context, tenant *models.Tenant) error {
    return r.db.WithContext(ctx).Create(tenant).Error
}

func (r *tenantRepository) GetByID(ctx context.Context, tenantID uuid.UUID) (*models.Tenant, error) {
    var tenant models.Tenant
    err := r.db.WithContext(ctx).First(&tenant, "tenant_id = ?", tenantID).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &tenant, nil
}

func (r *tenantRepository) GetBySubdomain(ctx context.Context, subdomain string) (*models.Tenant, error) {
    var tenant models.Tenant
    err := r.db.WithContext(ctx).First(&tenant, "subdomain = ?", subdomain).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &tenant, nil
}

func (r *tenantRepository) GetByDomain(ctx context.Context, domain string) (*models.Tenant, error) {
    var tenant models.Tenant
    err := r.db.WithContext(ctx).First(&tenant, "domain = ?", domain).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &tenant, nil
}

func (r *tenantRepository) Update(ctx context.Context, tenant *models.Tenant) error {
    return r.db.WithContext(ctx).Save(tenant).Error
}

func (r *tenantRepository) Delete(ctx context.Context, tenantID uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&models.Tenant{}, "tenant_id = ?", tenantID).Error
}

func (r *tenantRepository) List(ctx context.Context, limit, offset int) ([]*models.Tenant, error) {
    var tenants []*models.Tenant
    err := r.db.WithContext(ctx).Limit(limit).Offset(offset).Find(&tenants).Error
    return tenants, err
}
