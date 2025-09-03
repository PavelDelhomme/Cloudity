import React, { useState } from 'react'

interface LoginProps {
  onLogin: (token: string) => void
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5'
  },
  form: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    width: '400px'
  },
  title: {
    fontSize: '24px',
    color: '#1976d2',
    marginBottom: '30px',
    textAlign: 'center' as const
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '16px'
  },
  button: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer'
  },
  error: {
    color: '#f44336',
    marginBottom: '16px',
    textAlign: 'center' as const
  }
}

function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'admin'
        },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (response.ok) {
        // Vérifier que c'est un admin
        if (data.user?.role === 'admin') {
          localStorage.setItem('admin-token', data.access_token)
          localStorage.setItem('admin-user', JSON.stringify(data.user))
          onLogin(data.access_token)
        } else {
          setError('Access denied: Admin role required')
        }
      } else {
        setError(data.message || 'Login failed')
      }
    } catch (err) {
      setError('Network error')
    }

    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h1 style={styles.title}>Cloudity Admin</h1>
        
        {error && <div style={styles.error}>{error}</div>}
        
        <input
          style={styles.input}
          type="email"
          placeholder="Admin Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        
        <button 
          style={styles.button} 
          type="submit" 
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

export default Login