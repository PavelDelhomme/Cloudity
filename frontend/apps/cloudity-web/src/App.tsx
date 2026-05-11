import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth, Global401Handler } from './authContext'

import Landing from './pages/public/Landing'
import LoginPage from './pages/public/LoginPage'
import RegisterPage from './pages/public/RegisterPage'

import AppLayout from './layouts/AppLayout'
import AppHub from './pages/app/hub/AppHub'
import DrivePage from './pages/app/drive/DrivePage'
import OfficePage from './pages/app/office/OfficePage'
import DocumentEditorPage from './pages/app/office/DocumentEditorPage'
import PassPage from './pages/app/pass/PassPage'
import MailPage from './pages/app/mail/MailPage'
import CalendarPage from './pages/app/calendar/CalendarPage'
import NotesPage from './pages/app/notes/NotesPage'
import TasksPage from './pages/app/tasks/TasksPage'
import ContactsPage from './pages/app/contacts/ContactsPage'
import PhotosPage from './pages/app/photos/PhotosPage'
import AppSettingsPage from './pages/app/settings/AppSettingsPage'

import { isAdminUiReturnPath, normalizePostLoginPath } from '@cloudity/shared'
import { FullPageRedirect, isAdminUiSpaPath } from './postAuthNavigate'

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
  const location = useLocation()
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`${to}?next=${encodeURIComponent(returnTo)}`} replace state={{ returnTo }} />
  }
  return <>{children}</>
}

function RedirectIfAuth({ children, to = '/app' }: { children: React.ReactNode; to?: string }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (isAuthenticated) {
    const q = typeof window !== 'undefined' ? window.location.search : location.search
    const nextParam = new URLSearchParams(q).get('next')
    const stateReturnTo = (location.state as { returnTo?: string } | null)?.returnTo
    const target = nextParam ?? stateReturnTo ?? to
    const safeTarget =
      target.startsWith('/app') || isAdminUiReturnPath(target) ? normalizePostLoginPath(target) : to
    if (isAdminUiSpaPath(safeTarget)) {
      return <FullPageRedirect href={safeTarget} />
    }
    return <Navigate to={safeTarget} replace />
  }
  return <>{children}</>
}

/** Shell utilisateur + pages publiques. Le back-office est un second bundle (`admin.html` / AdminApp). */
export function UserAppRoutes() {
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserAppRoutes />
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
