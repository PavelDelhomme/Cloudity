import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../authContext'
import { register as apiRegister } from '../../api'
import toast from 'react-hot-toast'
import { Label, Input, Button } from '../../components/PageLayout'

export default function RegisterPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast.error('Email et mot de passe requis')
      return
    }
    if (password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Les deux mots de passe ne correspondent pas')
      return
    }
    setLoading(true)
    try {
      const res = await apiRegister({ email: email.trim(), password })
      setAuth(res.access_token!, res.refresh_token, 1, email.trim())
      toast.success('Compte créé. Bienvenue !')
      navigate('/app', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l’inscription')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link to="/" className="text-xl font-semibold text-gray-900">
            Cloudity
          </Link>
          <p className="text-gray-600 text-sm mt-1">Créer un compte</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="vous@exemple.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe (min. 8 caractères)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full !py-2.5">
              {loading ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            Déjà un compte ? <Link to="/login" className="text-blue-600 font-medium">Se connecter</Link>
          </p>
        </div>
        <p className="mt-4 text-center text-sm">
          <Link to="/" className="text-gray-500 hover:text-gray-700">← Accueil</Link>
        </p>
      </div>
    </div>
  )
}
