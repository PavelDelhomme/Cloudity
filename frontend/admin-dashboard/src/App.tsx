import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import Login from './Login'

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' },
  sidebar: { 
    width: '250px', backgroundColor: 'white', boxShadow: '2px 0 4px rgba(0,0,0,0.1)', 
    minHeight: '100vh', position: 'fixed' as const 
  },
  main: { marginLeft: '250px', padding: '30px' },
  card: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '20px' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { backgroundColor: '#f5f5f5', padding: '12px', textAlign: 'left' as const, borderBottom: '1px solid #ddd' },
  td: { padding: '12px', borderBottom: '1px solid #ddd' },
  button: { backgroundColor: '#1976d2', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' },
  buttonDanger: { backgroundColor: '#f44336', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }
}

// Hook pour authentification
function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const token = localStorage.getItem('admin-token')
    const userData = localStorage.getItem('admin-user')
    
    if (token && userData) {
      setUser(JSON.parse(userData))
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const login = (token: string) => {
    setIsAuthenticated(true)
    const userData = localStorage.getItem('admin-user')
    if (userData) setUser(JSON.parse(userData))
  }

  const logout = () => {
    localStorage.removeItem('admin-token')
    localStorage.removeItem('admin-user')
    setIsAuthenticated(false)
    setUser(null)
  }

  return { isAuthenticated, loading, user, login, logout }
}

function Layout({ children, user, onLogout }: { children: React.ReactNode, user: any, onLogout: () => void }) {
  const location = useLocation()
  const navigation = [
    { name: 'Dashboard', href: '/' },
    { name: 'Tenants', href: '/tenants' },
    { name: 'Users', href: '/users' },
    { name: 'Services', href: '/services' },
    { name: 'Database', href: '/database' },
    { name: 'Email Config', href: '/email' },
    { name: 'Logs', href: '/logs' }
  ]

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e0e0e0' }}>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#1976d2' }}>Cloudity Admin</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Welcome, {user?.email}
          </p>
        </div>
        <nav style={{ marginTop: '20px' }}>
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              style={{
                display: 'block', padding: '12px 20px', textDecoration: 'none',
                color: location.pathname === item.href ? '#1976d2' : '#333',
                backgroundColor: location.pathname === item.href ? '#e3f2fd' : 'transparent'
              }}
            >
              {item.name}
            </Link>
          ))}
          <button
            onClick={onLogout}
            style={{
              ...styles.button,
              width: '90%',
              margin: '20px 5%',
              backgroundColor: '#f44336'
            }}
          >
            Logout
          </button>
        </nav>
      </aside>
      <main style={styles.main}>{children}</main>
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState({ tenants: 0, users: 0, services: 0 })
  
  React.useEffect(() => {
    fetch('/api/v1/admin/tenants')
      .then(res => res.json())
      .then(data => setStats(prev => ({ ...prev, tenants: data.length })))
      .catch(console.error)
      
    fetch('/api/v1/admin/users')
      .then(res => res.json())
      .then(data => setStats(prev => ({ ...prev, users: data.length })))
      .catch(console.error)
  }, [])

  return (
    <div>
      <h2 style={{ fontSize: '32px', marginBottom: '30px', color: '#333' }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        <div style={styles.card}>
          <h3 style={{ color: '#666' }}>Active Tenants</h3>
          <p style={{ fontSize: '36px', color: '#1976d2', margin: 0 }}>{stats.tenants}</p>
        </div>
        <div style={styles.card}>
          <h3 style={{ color: '#666' }}>Total Users</h3>
          <p style={{ fontSize: '36px', color: '#4caf50', margin: 0 }}>{stats.users}</p>
        </div>
        <div style={styles.card}>
          <h3 style={{ color: '#666' }}>Services</h3>
          <p style={{ fontSize: '36px', color: '#ff9800', margin: 0 }}>{stats.services}</p>
        </div>
      </div>
      
      <div style={styles.card}>
        <h3>Quick Actions</h3>
        <button style={styles.button}>Create Tenant</button>
        <button style={styles.button}>Add User</button>
        <button style={styles.button}>Restart Services</button>
      </div>
    </div>
  )
}

function TenantsManagement() {
  const [tenants, setTenants] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  
  React.useEffect(() => {
    fetch('/api/v1/admin/tenants')
      .then(res => res.json())
      .then(setTenants)
      .catch(console.error)
  }, [])

  const createTenant = async (data: any) => {
    try {
      const response = await fetch('/api/v1/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (response.ok) {
        // Refresh list
        const updated = await fetch('/api/v1/admin/tenants').then(r => r.json())
        setTenants(updated)
        setShowForm(false)
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ fontSize: '32px', color: '#333', margin: 0 }}>Tenants Management</h2>
        <button style={styles.button} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create Tenant'}
        </button>
      </div>

      {showForm && (
        <div style={styles.card}>
          <h3>Create New Tenant</h3>
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target as HTMLFormElement)
            createTenant({
              name: formData.get('name'),
              subdomain: formData.get('subdomain'),
              max_users: parseInt(formData.get('max_users') as string),
              max_storage_gb: parseInt(formData.get('max_storage_gb') as string)
            })
          }}>
            <input name="name" placeholder="Tenant Name" required style={{...styles.button, backgroundColor: 'white', color: 'black', border: '1px solid #ddd', marginBottom: '10px'}} />
            <input name="subdomain" placeholder="Subdomain" required style={{...styles.button, backgroundColor: 'white', color: 'black', border: '1px solid #ddd', marginBottom: '10px'}} />
            <input name="max_users" type="number" placeholder="Max Users" required style={{...styles.button, backgroundColor: 'white', color: 'black', border: '1px solid #ddd', marginBottom: '10px'}} />
            <input name="max_storage_gb" type="number" placeholder="Storage (GB)" required style={{...styles.button, backgroundColor: 'white', color: 'black', border: '1px solid #ddd', marginBottom: '10px'}} />
            <button type="submit" style={styles.button}>Create</button>
          </form>
        </div>
      )}

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Subdomain</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Users</th>
              <th style={styles.th}>Storage</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td style={styles.td}>{tenant.name}</td>
                <td style={styles.td}>{tenant.subdomain}</td>
                <td style={styles.td}>
                  <span style={{
                    backgroundColor: tenant.status === 'active' ? '#4caf50' : '#f44336',
                    color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px'
                  }}>
                    {tenant.status}
                  </span>
                </td>
                <td style={styles.td}>{tenant.max_users}</td>
                <td style={styles.td}>{tenant.max_storage_gb} GB</td>
                <td style={styles.td}>
                  <button style={styles.button}>Edit</button>
                  <button style={styles.buttonDanger}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServicesControl() {
  const [services, setServices] = useState<any[]>([])
  
  React.useEffect(() => {
    fetch('/api/v1/admin/services')
      .then(res => res.json())
      .then(data => setServices(data.services))
      .catch(console.error)
  }, [])

  const controlService = async (serviceName: string, action: string) => {
    try {
      await fetch(`/api/v1/admin/services/${serviceName}/${action}`, { method: 'POST' })
      // Refresh services
      setTimeout(() => {
        fetch('/api/v1/admin/services')
          .then(res => res.json())
          .then(data => setServices(data.services))
      }, 2000)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: '32px', marginBottom: '30px', color: '#333' }}>Services Control</h2>
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Service</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Port</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.name}>
                <td style={styles.td}>{service.name}</td>
                <td style={styles.td}>
                  <span style={{
                    backgroundColor: service.status === 'healthy' ? '#4caf50' : '#f44336',
                    color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px'
                  }}>
                    {service.status}
                  </span>
                </td>
                <td style={styles.td}>{service.port}</td>
                <td style={styles.td}>
                  <button 
                    style={styles.button}
                    onClick={() => controlService(service.name, 'restart')}
                  >
                    Restart
                  </button>
                  <button 
                    style={styles.buttonDanger}
                    onClick={() => controlService(service.name, 'stop')}
                  >
                    Stop
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Composant principal avec protection d'authentification
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!isAuthenticated) return <Navigate to="/login" />
  
  return <>{children}</>
}

function App() {
  const { isAuthenticated, loading, user, login, logout } = useAuth()

  if (loading) {
    return <div style={{...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Loading...</div>
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />
  }

  return (
    <Router>
      <Layout user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tenants" element={<TenantsManagement />} />
          <Route path="/users" element={<div>Users Management (À développer)</div>} />
          <Route path="/services" element={<ServicesControl />} />
          <Route path="/database" element={<div>Database Management (À développer)</div>} />
          <Route path="/email" element={<div>Email Configuration (À développer)</div>} />
          <Route path="/logs" element={<div>Real-time Logs (À développer)</div>} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App