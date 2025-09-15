import React from 'react'
import { adminService } from '../../services/admin.service'

type Tenant = {
  id: string
  name: string
  subdomain?: string
  status?: string
  max_users?: number
  max_storage_gb?: number
}

export const TenantsManager: React.FC = () => {
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showForm, setShowForm] = React.useState<boolean>(false)

  const loadTenants = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminService.getTenants()
      setTenants(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement des tenants')
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadTenants()
  }, [loadTenants])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const payload = {
      name: String(formData.get('name') || ''),
      subdomain: String(formData.get('subdomain') || ''),
      max_users: Number(formData.get('max_users') || 10),
      max_storage_gb: Number(formData.get('max_storage_gb') || 100)
    }
    try {
      await adminService.createTenant(payload)
      await loadTenants()
      setShowForm(false)
      e.currentTarget.reset()
    } catch (err: any) {
      alert(err?.message || 'Erreur création tenant')
    }
  }

  const handleDelete = async (tenantId: string) => {
    if (!confirm('Supprimer ce tenant ?')) return
    try {
      await adminService.deleteTenant(tenantId)
      setTenants(tenants.filter(t => t.id !== tenantId))
    } catch (err: any) {
      alert(err?.message || 'Erreur suppression tenant')
    }
  }

  if (loading) return <div>🔄 Chargement des tenants...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Gestion des Tenants</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#1976d2', color: 'white', padding: '10px 20px', borderRadius: 4 }}>
          {showForm ? 'Annuler' : 'Ajouter Tenant'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: 10, borderRadius: 4, marginBottom: 12 }}>⚠️ {error}</div>
      )}

      {showForm && (
        <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Créer un Tenant</h3>
          <form onSubmit={handleCreate}>
            <input name="name" placeholder="Nom" required style={{ margin: 6, padding: 10 }} />
            <input name="subdomain" placeholder="Sous-domaine" required style={{ margin: 6, padding: 10 }} />
            <input name="max_users" type="number" placeholder="Max utilisateurs" style={{ margin: 6, padding: 10 }} />
            <input name="max_storage_gb" type="number" placeholder="Stockage (GB)" style={{ margin: 6, padding: 10 }} />
            <button type="submit" style={{ backgroundColor: '#1976d2', color: 'white', padding: '10px 20px', borderRadius: 4 }}>Créer</button>
          </form>
        </div>
      )}

      <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr>
              <th style={th}>Nom</th>
              <th style={th}>Sous-domaine</th>
              <th style={th}>Statut</th>
              <th style={th}>Max Users</th>
              <th style={th}>Stockage</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center' }}>Aucun tenant</td>
              </tr>
            ) : tenants.map((t) => (
              <tr key={t.id}>
                <td style={td}>{t.name}</td>
                <td style={td}>{t.subdomain}</td>
                <td style={td}>{t.status || '-'}</td>
                <td style={td}>{t.max_users ?? '-'}</td>
                <td style={td}>{t.max_storage_gb ?? '-'} GB</td>
                <td style={td}>
                  <button style={{ marginRight: 8 }} disabled>Éditer</button>
                  <button onClick={() => handleDelete(t.id)} style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 10px', borderRadius: 4 }}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { backgroundColor: '#f5f5f5', padding: 12, textAlign: 'left', borderBottom: '1px solid #ddd' }
const td: React.CSSProperties = { padding: 12, borderBottom: '1px solid #eee' }

export default TenantsManager

