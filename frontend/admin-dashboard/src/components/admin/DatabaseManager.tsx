import React from 'react'
import { adminService } from '../../services/admin.service'

type Database = {
  id: string
  name: string
  tenant?: string
  status?: string
}

export const DatabaseManager: React.FC = () => {
  const [databases, setDatabases] = React.useState<Database[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showForm, setShowForm] = React.useState<boolean>(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminService.listDatabases()
      setDatabases(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement des bases')
      setDatabases([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      name: String(fd.get('name') || ''),
      tenant: String(fd.get('tenant') || ''),
      engine: String(fd.get('engine') || 'postgres'),
    }
    try {
      await adminService.createDatabase(payload)
      await load()
      setShowForm(false)
      e.currentTarget.reset()
    } catch (err: any) {
      alert(err?.message || 'Erreur création base')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette base ?')) return
    try {
      await adminService.deleteDatabase(id)
      setDatabases(databases.filter(d => d.id !== id))
    } catch (err: any) {
      alert(err?.message || 'Erreur suppression base')
    }
  }

  const handleBackup = async (id: string) => {
    try {
      await adminService.backupDatabase(id)
      alert('Backup démarré')
    } catch (err: any) {
      alert(err?.message || 'Erreur backup')
    }
  }

  if (loading) return <div>🔄 Chargement des bases...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Gestion des Bases</h1>
        <button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#1976d2', color: 'white', padding: '10px 20px', borderRadius: 4 }}>
          {showForm ? 'Annuler' : 'Créer Base'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: 10, borderRadius: 4, marginBottom: 12 }}>⚠️ {error}</div>
      )}

      {showForm && (
        <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Créer une Base</h3>
          <form onSubmit={handleCreate}>
            <input name="name" placeholder="Nom" required style={{ margin: 6, padding: 10 }} />
            <input name="tenant" placeholder="Tenant (optionnel)" style={{ margin: 6, padding: 10 }} />
            <input name="engine" placeholder="Moteur (postgres)" style={{ margin: 6, padding: 10 }} />
            <button type="submit" style={{ backgroundColor: '#1976d2', color: 'white', padding: '10px 20px', borderRadius: 4 }}>Créer</button>
          </form>
        </div>
      )}

      <div style={{ background: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead>
            <tr>
              <th style={th}>Nom</th>
              <th style={th}>Tenant</th>
              <th style={th}>Statut</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {databases.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...td, textAlign: 'center' }}>Aucune base</td>
              </tr>
            ) : databases.map((db) => (
              <tr key={db.id}>
                <td style={td}>{db.name}</td>
                <td style={td}>{db.tenant || '-'}</td>
                <td style={td}>{db.status || '-'}</td>
                <td style={td}>
                  <button onClick={() => handleBackup(db.id)} style={{ marginRight: 8 }}>Backup</button>
                  <button onClick={() => handleDelete(db.id)} style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 10px', borderRadius: 4 }}>Supprimer</button>
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

export default DatabaseManager

