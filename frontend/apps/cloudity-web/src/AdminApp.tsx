import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, Global401Handler } from './authContext'
import { ADMIN_UI_BASE_PATH } from '@cloudity/shared'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import TenantsPage from './pages/admin/Tenants'
import UsersPage from './pages/admin/Users'
import SettingsPage from './pages/admin/Settings'
import MobileDistributionPage from './pages/admin/MobileDistributionPage'
import MobileLogsPage from './pages/admin/MobileLogsPage'
import DomainesPage from './pages/admin/Domaines'
import SecurityCvePage from './pages/admin/SecurityCvePage'
import PasskeysPage from './pages/admin/Passkeys'
import UiCatalogPage from './pages/admin/UiCatalogPage'
import PilotagePage from './pages/admin/PilotagePage'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { StackHealthGate } from './components/StackHealthGate'
import { AdminAccessGate } from './AdminAccessGate'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

/** Routes admin : à monter sous Router + AuthProvider (voir `AdminApp`). */
export function AdminAppRoutes() {
  return (
    <Routes>
      <Route
        path="/4dm1n"
        element={
          <AdminAccessGate>
            <AdminLayout />
          </AdminAccessGate>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pilotage" element={<PilotagePage />} />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="mobile-distribution" element={<MobileDistributionPage />} />
        <Route path="mobile-logs" element={<MobileLogsPage />} />
        <Route path="domaines" element={<DomainesPage />} />
        <Route path="securite-cve" element={<SecurityCvePage />} />
        <Route path="passkeys" element={<PasskeysPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="dev/ui" element={<UiCatalogPage />} />
      </Route>
      <Route
        path="*"
        element={
          <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <h1 className="text-xl font-semibold">Page introuvable</h1>
              <p className="text-sm text-slate-300">
                Le back-office est servi uniquement sous <span className="font-mono">{ADMIN_UI_BASE_PATH}</span>.
                Aucune redirection depuis <span className="font-mono">/admin</span> n’est exposée (anti-énumération).
              </p>
              <a className="text-emerald-400 underline text-sm" href={ADMIN_UI_BASE_PATH}>
                Ouvrir le back-office
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  )
}

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <StackHealthGate>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <Global401Handler />
              <AdminAppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </StackHealthGate>
      </AppErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!bg-slate-800 !text-white !rounded-xl',
          success: { iconTheme: { primary: '#34d399', secondary: '#0f172a' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#0f172a' } },
        }}
      />
    </QueryClientProvider>
  )
}
