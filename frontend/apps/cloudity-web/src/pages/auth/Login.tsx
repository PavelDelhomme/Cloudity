import React, { useState } from 'react'
import { useAuth } from '../../authContext'
import { login as apiLogin } from '../../api'
import { tenantIdFromAccessToken } from '@cloudity/shared'
import toast from 'react-hot-toast'
import { Label, Input, Button } from '@cloudity/shared'

export default function Login() {
  const { login: setAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Email et mot de passe requis')
      return
    }
    setLoading(true)
    try {
      const res = await apiLogin({ email: email.trim(), password })
      if (res.requires_2fa) {
        toast.error('Connexion 2FA non gérée depuis ce formulaire')
        return
      }
      const tid =
        (typeof res.tenant_id === 'number' ? res.tenant_id : parseInt(String(res.tenant_id ?? ''), 10)) ||
        tenantIdFromAccessToken(res.access_token) ||
        1
      setAuth(res.access_token, res.refresh_token ?? undefined, tid, email.trim())
      toast.success('Connexion réussie')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Cloudity</h1>
          <p className="text-slate-400 mt-1">Espace d’administration</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/50 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Connexion</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="admin@exemple.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full !py-2.5">
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
