import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, Global401Handler } from './authContext'
import { ADMIN_UI_BASE_PATH } from '@cloudity/shared'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import TenantsPage from './pages/admin/Tenants'
import UsersPage from './pages/admin/Users'
import SettingsPage from './pages/admin/Settings'
import VaultsPage from './pages/admin/Vaults'
import DomainesPage from './pages/admin/Domaines'
import SecurityCvePage from './pages/admin/SecurityCvePage'
import { AdminAccessGate } from './AdminAccessGate'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

function RedirectLegacyAdminToObfuscated() {
  const loc = useLocation()
  const suffix = loc.pathname === '/admin' ? '' : loc.pathname.slice('/admin'.length)
  const to = `${ADMIN_UI_BASE_PATH}${suffix}${loc.search}${loc.hash}`
  return <Navigate to={to} replace />
}

/** Routes admin : à monter sous un Router (Browser ou Memory). */
export function AdminAppRoutes() {
  return (
    <AuthProvider>
      <Global401Handler />
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
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="vaults" element={<VaultsPage />} />
          <Route path="domaines" element={<DomainesPage />} />
          <Route path="securite-cve" element={<SecurityCvePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/admin/*" element={<RedirectLegacyAdminToObfuscated />} />
        <Route path="*" element={<Navigate to="/4dm1n" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminAppRoutes />
      </BrowserRouter>
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
