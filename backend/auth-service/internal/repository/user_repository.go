package repository

import (
    "context"
    "errors"
    
    "github.com/PavelDelhomme/Cloudity/services/auth-service/models"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

type UserRepository interface {
    Create(ctx context.Context, user *models.User) error
    GetByID(ctx context.Context, userID uuid.UUID) (*models.User, error)
    GetByEmailAndTenant(ctx context.Context, email string, tenantID uuid.UUID) (*models.User, error)
    Update(ctx context.Context, user *models.User) error
    Delete(ctx context.Context, userID uuid.UUID) error
    ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]*models.User, error)
    CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error)
}

type userRepository struct {
    db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
    return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *models.User) error {
    return r.db.WithContext(ctx).Create(user).Error
}

func (r *userRepository) GetByID(ctx context.Context, userID uuid.UUID) (*models.User, error) {
    var user models.User
    err := r.db.WithContext(ctx).Preload("Tenant").First(&user, "user_id = ?", userID).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &user, nil
}

func (r *userRepository) GetByEmailAndTenant(ctx context.Context, email string, tenantID uuid.UUID) (*models.User, error) {
    var user models.User
    err := r.db.WithContext(ctx).
        Preload("Tenant").
        First(&user, "email = ? AND tenant_id = ?", email, tenantID).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &user, nil
}

func (r *userRepository) Update(ctx context.Context, user *models.User) error {
    return r.db.WithContext(ctx).Save(user).Error
}

func (r *userRepository) Delete(ctx context.Context, userID uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&models.User{}, "user_id = ?", userID).Error
}

func (r *userRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]*models.User, error) {
    var users []*models.User
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Limit(limit).Offset(offset).
        Find(&users).Error
    return users, err
}

func (r *userRepository) CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error) {
    var count int64
    err := r.db.WithContext(ctx).
        Model(&models.User{}).
        Where("tenant_id = ?", tenantID).
        Count(&count).Error
    return count, err
}
