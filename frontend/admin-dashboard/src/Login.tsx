import React, { useState } from 'react'

interface LoginProps {
  onLogin: (token: string) => void
}

function Login({ onLogin }: LoginProps) {
  const [formData, setFormData] = useState({
    email: 'admin@cloudity.com',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // CORRECTION : Appel à l'API Gateway (pas directement au port 3000)
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'admin' // Tenant admin pour le dashboard
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Erreur de connexion')
      }

      const data = await response.json()
      
      // Stocker le token et les données utilisateur
      localStorage.setItem('admin-token', data.access_token)
      localStorage.setItem('admin-user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        tenant_id: data.user.tenant_id
      }))

      // Configurer le header Authorization pour les futures requêtes
      // Cela sera géré par l'intercepteur axios ou fetch
      
      onLogin(data.access_token)
      
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || 'Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: '#333', marginBottom: '0.5rem' }}>
            🔐 Cloudity Admin
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            Dashboard d'administration
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Email Administrateur
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
              required
            />
          </div>

          {error && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#fee',
              color: '#c53030',
              borderRadius: '4px',
              border: '1px solid #fed7d7'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? '#ccc' : '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
          <p>Compte par défaut :</p>
          <p><strong>admin@cloudity.com</strong></p>
          <p><em>(Configurez le mot de passe dans auth-service)</em></p>
        </div>
      </div>
    </div>
  )
}

export default Login