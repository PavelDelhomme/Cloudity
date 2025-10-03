import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Login from './Login'
import Dashboard from './pages/Dashboard/Dashboard'
import ServicesStatus from './pages/Services/ServicesStatus'
import ServiceDetails from './pages/Services/ServiceDetails'
import UsersManagement from './pages/Users/UsersManagement'
import UserDetails from './pages/Users/UserDetails'
import TenantsManagement from './pages/Tenants/TenantsManagement'
import TenantDetails from './pages/Tenants/TenantDetails'
import DatabaseManager from './pages/Database/DatabaseManager'
import Layout from './components/Layout/Layout'
import { adminService } from './services/admin.service'

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

// Composant principal de l'application
function AppContent() {
  const { isAuthenticated, loading, user, login, logout } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Chargement de l'interface d'administration...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />
  }

  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/services" element={<ServicesStatus />} />
        <Route path="/services/:serviceName" element={<ServiceDetails />} />
        <Route path="/users" element={<UsersManagement />} />
        <Route path="/users/:userId" element={<UserDetails />} />
        <Route path="/tenants" element={<TenantsManagement />} />
        <Route path="/tenants/:tenantId" element={<TenantDetails />} />
        <Route path="/database" element={<DatabaseManager />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <AppContent />
        <Toaster position="top-right" />
      </div>
    </Router>
  )
}

export default App