/**
 * Messages d'erreur auth lisibles (réseau, CORS, stack down, credentials).
 */
export function formatAuthError(err: unknown, context: 'login' | 'register' = 'login'): string {
  const action = context === 'register' ? "l'inscription" : 'la connexion'
  if (err instanceof TypeError && /fetch|network|failed/i.test(String(err.message))) {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    if (host.endsWith('.localhost') || host === 'localhost') {
      return `Impossible de joindre l'API (${action}). Vérifiez que la stack tourne (make up) et que vous ouvrez bien le dashboard sur le port 6001.`
    }
    return `Impossible de joindre l'API (${action}). Vérifiez make up, le port gateway 6002, et votre connexion réseau.`
  }
  if (err instanceof Error && err.message) {
    if (/401|403|invalid|incorrect|mot de passe|password|credentials/i.test(err.message)) {
      return err.message
    }
    if (/502|503|504|gateway|unavailable/i.test(err.message)) {
      return `Service temporairement indisponible (${err.message}). Attendez la fin du démarrage ou consultez make logs.`
    }
    return err.message
  }
  return `Erreur inattendue lors de ${action}.`
}
