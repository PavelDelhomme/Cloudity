import React from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth, Global401Handler } from './authContext'

import Landing from './pages/public/Landing'
import LoginPage from './pages/public/LoginPage'
import RegisterPage from './pages/public/RegisterPage'

import AppLayout from './layouts/AppLayout'
import AppHub from './pages/app/AppHub'
import DrivePage from './pages/app/DrivePage'
import OfficePage from './pages/app/OfficePage'
import DocumentEditorPage from './pages/app/DocumentEditorPage'
import PassPage from './pages/app/PassPage'
import MailPage from './pages/app/MailPage'
import CalendarPage from './pages/app/CalendarPage'
import NotesPage from './pages/app/NotesPage'
import TasksPage from './pages/app/TasksPage'
import ContactsPage from './pages/app/ContactsPage'
import PhotosPage from './pages/app/PhotosPage'
import AppSettingsPage from './pages/app/AppSettingsPage'

import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/Dashboard'
import TenantsPage from './pages/Tenants'
import UsersPage from './pages/Users'
import SettingsPage from './pages/Settings'
import VaultsPage from './pages/Vaults'
import DomainesPage from './pages/Domaines'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

function RequireAuth({ children, to = '/login' }: { children: React.ReactNode; to?: string }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to={to} replace />
  return <>{children}</>
}

function RedirectIfAuth({ children, to = '/app' }: { children: React.ReactNode; to?: string }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to={to} replace />
  return <>{children}</>
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <Global401Handler />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuth>
              <RegisterPage />
            </RedirectIfAuth>
          }
        />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AppHub />} />
          <Route path="drive" element={<DrivePage />} />
          <Route path="corbeille" element={<Navigate to="/app/drive?view=trash" replace />} />
          <Route path="office" element={<OfficePage />} />
          <Route path="office/editor/:nodeId" element={<DocumentEditorPage />} />
          <Route path="pass" element={<PassPage />} />
          <Route path="mail" element={<MailPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="photos" element={<PhotosPage />} />
          <Route path="settings" element={<AppSettingsPage />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="vaults" element={<VaultsPage />} />
          <Route path="domaines" element={<DomainesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
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

export default App
