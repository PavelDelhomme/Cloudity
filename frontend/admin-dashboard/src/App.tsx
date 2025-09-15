import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import Login from './Login'
import { adminService } from './services/admin.service'

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
  buttonDanger: { backgroundColor: '#f44336', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  error: { backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', margin: '10px 0' },
  success: { backgroundColor: '#e8f5e8', color: '#2e7d2e', padding: '10px', borderRadius: '4px', margin: '10px 0' }
}

// Hook pour authentification
function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

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
      <div style={styles.sidebar}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h2 style={{ margin: 0, color: '#1976d2' }}>Cloudity Admin</h2>
        </div>
        <nav style={{ padding: '20px 0' }}>
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              style={{
                display: 'block',
                padding: '10px 20px',
                color: location.pathname === item.href ? '#1976d2' : '#666',
                textDecoration: 'none',
                backgroundColor: location.pathname === item.href ? '#f0f7ff' : 'transparent'
              }}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px' }}>
          <p style={{ fontSize: '14px', color: '#666', margin: '0 0 10px 0' }}>
            Welcome, {user?.email || 'Admin'}
          </p>
          <button onClick={onLogout} style={styles.buttonDanger}>
            Logout
          </button>
        </div>
      </div>
      <div style={styles.main}>
        {children}
      </div>
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState({ tenants: 0, users: 0, services: 0 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  React.useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        console.log('🔄 Chargement des données dashboard...')
        
        // Tenants
        try {
          const tenantsData = await adminService.getTenants()
          console.log('✅ Tenants data:', tenantsData)
          const tenantsCount = Array.isArray(tenantsData) ? tenantsData.length : 0
          setStats(prev => ({ ...prev, tenants: tenantsCount }))
        } catch (err) {
          console.error('❌ Tenants error:', err)
          setStats(prev => ({ ...prev, tenants: 0 }))
        }
        
        // Users
        try {
          const usersData = await adminService.getUsers()
          console.log('✅ Users data:', usersData)
          const usersCount = Array.isArray(usersData) ? usersData.length : 0
          setStats(prev => ({ ...prev, users: usersCount }))
        } catch (err) {
          console.error('❌ Users error:', err)
          setStats(prev => ({ ...prev, users: 0 }))
        }

        // Services
        try {
          const servicesData = await adminService.getServicesStatus()
          console.log('✅ Services data:', servicesData)
          const servicesCount = (servicesData && servicesData.services && Array.isArray(servicesData.services)) ? servicesData.services.length : 0
          setStats(prev => ({ ...prev, services: servicesCount }))
        } catch (err) {
          console.error('❌ Services error:', err)
          setStats(prev => ({ ...prev, services: 0 }))
        }
        
      } catch (globalError) {
        console.error('❌ Erreur globale dashboard:', globalError)
        setError('Erreur de chargement des données')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  if (loading) {
    return <div>🔄 Chargement du dashboard...</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '30px' }}>Dashboard Cloudity</h1>
      
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div style={styles.card}>
          <h3 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>Active Tenants</h3>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>{stats.tenants}</div>
        </div>
        <div style={styles.card}>
          <h3 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>Total Users</h3>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>{stats.users}</div>
        </div>
        <div style={styles.card}>
          <h3 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>Services</h3>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>{stats.services}</div>
        </div>
      </div>
      
      <div style={styles.card}>
        <h3 style={{ marginBottom: '20px' }}>Actions Rapides</h3>
        <Link to="/tenants" style={styles.button}>Gérer Tenants</Link>
        <Link to="/users" style={styles.button}>Gérer Utilisateurs</Link>
        <Link to="/services" style={styles.button}>Contrôler Services</Link>
      </div>
    </div>
  )
}

function TenantsManagement() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  
  React.useEffect(() => {
    const loadTenants = async () => {
      setLoading(true)
      setError(null)
      
      try {
        console.log('🔄 Chargement des tenants...')
        const data = await adminService.getTenants()
        console.log('✅ Tenants loaded:', data)
        setTenants(Array.isArray(data) ? data : [])
      } catch (err: any) {
        console.error('❌ Failed to load tenants:', err)
        setError(`Erreur de chargement: ${err.message || 'Inconnue'}`)
        setTenants([])
      } finally {
        setLoading(false)
      }
    }

    loadTenants()
  }, [])

  const createTenant = async (data: any) => {
    try {
      await adminService.createTenant(data)
      // Refresh list
      const updated = await adminService.getTenants()
      setTenants(Array.isArray(updated) ? updated : [])
      setShowForm(false)
      setError(null)
    } catch (error: any) {
      setError(`Erreur création: ${error.message || 'Inconnue'}`)
      console.error('Failed to create tenant:', error)
    }
  }

  if (loading) return <div>🔄 Chargement des tenants...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Gestion des Tenants</h1>
        <button onClick={() => setShowForm(!showForm)} style={styles.button}>
          {showForm ? 'Annuler' : 'Ajouter Tenant'}
        </button>
      </div>

      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}

      {showForm && (
        <div style={styles.card}>
          <h3>Créer un Nouveau Tenant</h3>
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target as HTMLFormElement)
            createTenant({
              name: formData.get('name'),
              subdomain: formData.get('subdomain'),
              max_users: parseInt(formData.get('max_users') as string || '10'),
              max_storage_gb: parseInt(formData.get('max_storage_gb') as string || '100')
            })
          }}>
            <input name="name" placeholder="Nom" style={{ margin: '5px', padding: '10px' }} required />
            <input name="subdomain" placeholder="Sous-domaine" style={{ margin: '5px', padding: '10px' }} required />
            <input name="max_users" type="number" placeholder="Max Utilisateurs" style={{ margin: '5px', padding: '10px' }} />
            <input name="max_storage_gb" type="number" placeholder="Stockage (GB)" style={{ margin: '5px', padding: '10px' }} />
            <button type="submit" style={styles.button}>Créer</button>
          </form>
        </div>
      )}

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nom</th>
              <th style={styles.th}>Sous-domaine</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Utilisateurs</th>
              <th style={styles.th}>Stockage</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...styles.td, textAlign: 'center', fontStyle: 'italic' }}>
                  Aucun tenant trouvé
                </td>
              </tr>
            ) : (
              tenants.map((tenant: any) => (
                <tr key={tenant.id}>
                  <td style={styles.td}>{tenant.name}</td>
                  <td style={styles.td}>{tenant.subdomain}</td>
                  <td style={styles.td}>{tenant.status}</td>
                  <td style={styles.td}>{tenant.max_users}</td>
                  <td style={styles.td}>{tenant.max_storage_gb} GB</td>
                  <td style={styles.td}>
                    <button style={styles.button}>Éditer</button>
                    <button style={styles.buttonDanger}>Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ServicesControl() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  React.useEffect(() => {
    const loadServices = async () => {
      setLoading(true)
      setError(null)
      
      try {
        console.log('🔄 Chargement des services...')
        const data = await adminService.getServicesStatus()
        console.log('✅ Services response:', data)
        const servicesArray = (data && data.services && Array.isArray(data.services)) ? data.services : []
        setServices(servicesArray)
      } catch (err: any) {
        console.error('❌ Failed to load services:', err)
        setError(`Erreur services: ${err.message || 'Inconnue'}`)
        setServices([])
      } finally {
        setLoading(false)
      }
    }

    loadServices()
  }, [])

  const controlService = async (serviceName: string, action: string) => {
    try {
      console.log(`🔧 ${action} service: ${serviceName}`)
      await adminService.controlService(serviceName, action)
      
      // Refresh services après un délai
      setTimeout(async () => {
        try {
          const data = await adminService.getServicesStatus()
          const servicesArray = (data && data.services && Array.isArray(data.services)) ? data.services : []
          setServices(servicesArray)
          setError(null)
        } catch (refreshErr) {
          console.error('❌ Failed to refresh services:', refreshErr)
        }
      }, 2000)
    } catch (error: any) {
      setError(`Erreur contrôle service: ${error.message || 'Inconnue'}`)
      console.error('Failed to control service:', error)
    }
  }

  if (loading) return <div>🔄 Chargement des services...</div>

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Contrôle des Services</h1>
      
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Service</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Port</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...styles.td, textAlign: 'center', fontStyle: 'italic' }}>
                  Aucun service trouvé
                </td>
              </tr>
            ) : (
              services.map((service: any) => (
                <tr key={service.name}>
                  <td style={styles.td}>{service.name}</td>
                  <td style={styles.td}>
                    <span style={{ 
                      color: service.status === 'running' ? '#2e7d2e' : '#c62828',
                      fontWeight: 'bold'
                    }}>
                      {service.status}
                    </span>
                  </td>
                  <td style={styles.td}>{service.port}</td>
                  <td style={styles.td}>
                    <button 
                      onClick={() => controlService(service.name, 'start')} 
                      style={styles.button}
                      disabled={service.status === 'running'}
                    >
                      Start
                    </button>
                    <button 
                      onClick={() => controlService(service.name, 'stop')} 
                      style={styles.buttonDanger}
                      disabled={service.status !== 'running'}
                    >
                      Stop
                    </button>
                    <button 
                      onClick={() => controlService(service.name, 'restart')} 
                      style={styles.button}
                    >
                      Restart
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function UsersManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  React.useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError(null)
      
      try {
        console.log('🔄 Chargement des utilisateurs...')
        const data = await adminService.getUsers()
        console.log('✅ Users loaded:', data)
        setUsers(Array.isArray(data) ? data : [])
      } catch (err: any) {
        console.error('❌ Failed to load users:', err)
        setError(`Erreur utilisateurs: ${err.message || 'Inconnue'}`)
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  if (loading) return <div>🔄 Chargement des utilisateurs...</div>

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Gestion des Utilisateurs</h1>
      
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Nom</th>
              <th style={styles.th}>Rôle</th>
              <th style={styles.th}>Tenant</th>
              <th style={styles.th}>Statut</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...styles.td, textAlign: 'center', fontStyle: 'italic' }}>
                  Aucun utilisateur trouvé
                </td>
              </tr>
            ) : (
              users.map((user: any) => (
                <tr key={user.id}>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>{user.first_name} {user.last_name}</td>
                  <td style={styles.td}>{user.role}</td>
                  <td style={styles.td}>{user.tenant_name}</td>
                  <td style={styles.td}>
                    <span style={{ 
                      color: user.is_active ? '#2e7d2e' : '#c62828',
                      fontWeight: 'bold'
                    }}>
                      {user.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button style={styles.button}>Éditer</button>
                    <button style={styles.buttonDanger}>Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// Composant principal avec protection d'authentification
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) return <div>🔄 Chargement...</div>
  if (!isAuthenticated) return <Navigate to="/login" />
  
  return <>{children}</>
}

function App() {
  const { isAuthenticated, loading, user, login, logout } = useAuth()

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>🔄 Initialisation...</div>
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
          <Route path="/users" element={<UsersManagement />} />
          <Route path="/services" element={<ServicesControl />} />
          <Route path="/database" element={<div style={styles.card}>🚧 Base de données - À développer</div>} />
          <Route path="/email" element={<div style={styles.card}>🚧 Configuration Email - À développer</div>} />
          <Route path="/logs" element={<div style={styles.card}>🚧 Logs temps réel - À développer</div>} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App