import React from 'react'
import { ServiceStatusPage } from './ServiceStatusPage'

type State = { hasError: boolean; message?: string }

/** Capture les erreurs React (ex. module Vite, bug rendu) avec écran lisible. */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ServiceStatusPage
          title="Erreur interface"
          message="Une erreur empêche l’affichage de cette page."
          detail={this.state.message}
          onRetry={() => this.setState({ hasError: false, message: undefined })}
          retryLabel="Recharger la vue"
        />
      )
    }
    return this.props.children
  }
}
