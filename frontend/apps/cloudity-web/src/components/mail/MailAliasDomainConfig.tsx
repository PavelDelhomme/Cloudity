import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Label } from '@cloudity/shared'
import { fetchMailAliasConfig } from '../../api'
import {
  accountEmailDomain,
  clearStoredAliasHostSuffix,
  effectiveAliasHostSuffix,
  getStoredAliasHostSuffix,
  setStoredAliasHostSuffix,
  type MailAliasConfigResponse,
} from '../../lib/mailAlias'

type Props = {
  accessToken: string
  accountEmail?: string
  compact?: boolean
}

export default function MailAliasDomainConfig({ accessToken, accountEmail, compact }: Props) {
  const [draft, setDraft] = React.useState('')
  const [storedTick, setStoredTick] = React.useState(0)

  const configQuery = useQuery({
    queryKey: ['mail', 'alias-config'],
    queryFn: () => fetchMailAliasConfig(accessToken),
    staleTime: 5 * 60 * 1000,
  })

  const server = configQuery.data as MailAliasConfigResponse | undefined
  const effective = effectiveAliasHostSuffix(server, accountEmail)
  const hasUserOverride = storedTick >= 0 && getStoredAliasHostSuffix() != null

  React.useEffect(() => {
    setDraft(getStoredAliasHostSuffix() ?? effective)
  }, [effective, storedTick])

  const save = () => {
    const v = draft.trim().replace(/^@+/, '')
    if (!v) return
    setStoredAliasHostSuffix(v)
    setStoredTick((n) => n + 1)
  }

  const reset = () => {
    clearStoredAliasHostSuffix()
    setStoredTick((n) => n + 1)
  }

  const dom = accountEmailDomain(accountEmail)
  const hint =
    server?.env_configured && server.alias_host_suffix
      ? `Défaut serveur : @${server.alias_host_suffix}`
      : dom
        ? `Sans config : @alias.${dom}`
        : 'Choisissez une boîte pour déduire le domaine.'

  const wrapClass = compact
    ? 'space-y-2'
    : 'rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-3 space-y-2'

  return (
    <div className={wrapClass}>
      {!compact ? (
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Domaine des alias</h4>
      ) : (
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Domaine des alias</p>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Saisissez seulement le nom (ex. <code className="text-[10px]">newsletter</code>) — l’adresse sera{' '}
        <code className="text-[10px]">newsletter@{effective || 'alias.domaine'}</code>. {hint}
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="alias-host-suffix" className="text-xs">
            Suffixe (après @)
          </Label>
          <Input
            id="alias-host-suffix"
            type="text"
            autoComplete="off"
            placeholder="alias.exemple.ovh"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/^@+/, ''))}
            className={compact ? 'text-xs py-1' : undefined}
          />
        </div>
        <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={save} disabled={!draft.trim()}>
          Enregistrer
        </Button>
        {hasUserOverride ? (
          <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" onClick={reset}>
            Défaut
          </Button>
        ) : null}
      </div>
      {effective ? (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Actif : <strong className="font-mono">@{effective}</strong>
          {hasUserOverride ? ' (préférence locale)' : server?.env_configured ? ' (serveur)' : ' (dérivé boîte)'}
        </p>
      ) : null}
    </div>
  )
}
