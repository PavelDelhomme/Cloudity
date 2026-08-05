import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { MailGoogleConnectButton } from './MailGoogleConnectButton'

export type MailAddAccountModalProps = {
  open: boolean
  onClose: () => void
  googleOAuthEnabled: boolean
  googleConnecting: boolean
  onConnectGoogle: () => void
  connectEmailValue: string
  onConnectEmailChange: (value: string) => void
  connectPassword: string
  onConnectPasswordChange: (value: string) => void
  connectLabel: string
  onConnectLabelChange: (value: string) => void
  connectingAndSyncing: boolean
  onConnectImap: () => void
}

/**
 * Ajout de boîte mail — Google OAuth en premier (comme BlueMail / Gmail natif),
 * IMAP/SMTP en option pour OVH, Proton Bridge, etc.
 */
export function MailAddAccountModal({
  open,
  onClose,
  googleOAuthEnabled,
  googleConnecting,
  onConnectGoogle,
  connectEmailValue,
  onConnectEmailChange,
  connectPassword,
  onConnectPasswordChange,
  connectLabel,
  onConnectLabelChange,
  connectingAndSyncing,
  onConnectImap,
}: MailAddAccountModalProps) {
  const [imapOpen, setImapOpen] = useState(!googleOAuthEnabled)
  const isGmailAddress = /@gmail\.com$/i.test(connectEmailValue.trim())

  useEffect(() => {
    if (open) setImapOpen(!googleOAuthEnabled)
  }, [open, googleOAuthEnabled])

  if (!open) return null

  const resetAndClose = () => {
    onConnectEmailChange('')
    onConnectPasswordChange('')
    onConnectLabelChange('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mail-add-account-title"
      onClick={resetAndClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md p-6 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mail-add-account-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Ajouter un compte mail
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Connectez Gmail en un clic — comme sur votre téléphone. Aucun mot de passe d&apos;application à créer.
        </p>

        <MailGoogleConnectButton
          size="large"
          busy={googleConnecting}
          disabled={!googleOAuthEnabled}
          onClick={onConnectGoogle}
        />

        {googleOAuthEnabled ? (
          <p className="mt-2 text-xs text-center text-slate-500 dark:text-slate-400">
            Fenêtre Google → autorisez l&apos;accès à votre boîte → retour automatique ici.
          </p>
        ) : (
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            La connexion Google n&apos;est pas encore activée sur ce serveur (variables{' '}
            <code className="text-[11px]">GOOGLE_OAUTH_*</code>). Utilisez le formulaire IMAP ci-dessous ou demandez à
            l&apos;administrateur de suivre{' '}
            <code className="text-[11px]">docs/produit/MAIL-GMAIL-OAUTH.md</code>.
          </p>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">ou</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
        </div>

        <button
          type="button"
          onClick={() => setImapOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          aria-expanded={imapOpen}
        >
          Autre compte (OVH, Proton, IMAP…)
          {imapOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {imapOpen ? (
          <div className="mt-4 space-y-3">
            {isGmailAddress && googleOAuthEnabled ? (
              <p className="text-xs text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2">
                Pour <strong>Gmail</strong>, préférez le bouton Google ci-dessus — pas de mot de passe d&apos;application.
              </p>
            ) : null}
            {isGmailAddress && !googleOAuthEnabled ? (
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                  Gmail en IMAP : mot de passe d&apos;application obligatoire (2FA activée sur Google).
                </p>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 underline hover:no-underline"
                >
                  Créer un mot de passe d&apos;application →
                </a>
              </div>
            ) : null}
            <input
              type="email"
              value={connectEmailValue}
              onChange={(e) => onConnectEmailChange(e.target.value)}
              placeholder="vous@exemple.com"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="password"
              value={connectPassword}
              onChange={(e) => onConnectPasswordChange(e.target.value)}
              placeholder="Mot de passe IMAP"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              value={connectLabel}
              onChange={(e) => onConnectLabelChange(e.target.value)}
              placeholder="Libellé (optionnel)"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={resetAndClose}
                disabled={connectingAndSyncing}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onConnectImap}
                disabled={connectingAndSyncing || !connectEmailValue.trim() || !connectPassword.trim()}
                className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                {connectingAndSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ajout et synchro…
                  </>
                ) : (
                  'Ajouter et synchroniser'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
