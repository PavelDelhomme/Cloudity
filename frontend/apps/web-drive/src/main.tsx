import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@cloudity/web-shell/authContext'
import { ThemeProvider } from '@cloudity/web-shell/theme/themeContext'
import { AppErrorBoundary } from '@cloudity/web-shell/components/AppErrorBoundary'
import { ServiceStatusPage } from '@cloudity/web-shell/components/ServiceStatusPage'
import { DrivePage } from './index'
import DriveShellLayout from './DriveShellLayout'
import '@cloudity/web-shell/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, sessionReady } = useAuth()
  if (!sessionReady) {
    return <ServiceStatusPage title="Connexion…" message="Vérification de votre session en cours." />
  }
  if (!isAuthenticated) {
    window.location.replace(`/login?next=${encodeURIComponent('/app/drive/')}`)
    return <ServiceStatusPage title="Redirection…" message="Vers la page de connexion Cloudity." />
  }
  return <>{children}</>
}

function DriveAppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <DriveShellLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DrivePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <BrowserRouter basename="/app/drive" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <ThemeProvider appId="drive">
              <DriveAppRoutes />
            </ThemeProvider>
          </AuthProvider>
        </BrowserRouter>
      </AppErrorBoundary>
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
)
