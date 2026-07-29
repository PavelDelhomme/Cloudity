import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth, Global401Handler } from './authContext'
import { ThemeProvider, cloudityAppIdFromPath } from './theme/themeContext'

import Landing from './pages/public/Landing'
import LoginPage from './pages/public/LoginPage'
import RegisterPage from './pages/public/RegisterPage'

import AppLayout from './layouts/AppLayout'
import AppHub from './pages/app/hub/AppHub'
import SettingsRedirect from './pages/app/settings/SettingsRedirect'

import { isAdminUiReturnPath, normalizePostLoginPath } from '@cloudity/shared'
import { FullPageRedirect, isAdminUiSpaPath } from './postAuthNavigate'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { StackHealthGate } from './components/StackHealthGate'
import { ServiceStatusPage } from './components/ServiceStatusPage'

/**
 * Produits en lazy chunks (FE-HUB-01) : le shell ne charge plus Mail/Drive/… au boot.
 * FE-SPLIT-* déplacera ces modules vers `frontend/apps/web-*`.
 */
const DrivePage = lazy(() => import('./pages/app/drive/DrivePage'))
const OfficePage = lazy(() => import('./pages/app/office/OfficePage'))
const DocumentEditorPage = lazy(() => import('./pages/app/office/DocumentEditorPage'))
const PassPage = lazy(() => import('./pages/app/pass/PassPage'))
const MailPage = lazy(() => import('@cloudity/web-mail').then((m) => ({ default: m.MailPage })))
const CalendarPage = lazy(() => import('./pages/app/calendar/CalendarPage'))
const NotesPage = lazy(() => import('./pages/app/notes/NotesPage'))
const TasksPage = lazy(() => import('./pages/app/tasks/TasksPage'))
const ContactsPage = lazy(() => import('./pages/app/contacts/ContactsPage'))
const PhotosPage = lazy(() => import('./pages/app/photos/PhotosPage'))
const AppSettingsPage = lazy(() => import('./pages/app/settings/AppSettingsPage'))
const SecureSettingsPage = lazy(() => import('./pages/app/settings/SecureSettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

function RouteFallback() {
  return (
    <ServiceStatusPage title="Chargement…" message="Préparation de l’application." />
  )
}

function RequireAuth({ children, to = '/login' }: { children: React.ReactNode; to?: string }) {
  const { isAuthenticated, sessionReady } = useAuth()
  const location = useLocation()
  if (!sessionReady) {
    return (
      <ServiceStatusPage
        title="Connexion…"
        message="Vérification de votre session en cours."
      />
    )
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`${to}?next=${encodeURIComponent(returnTo)}`} replace state={{ returnTo }} />
  }
  return <>{children}</>
}

function RedirectIfAuth({ children, to = '/app' }: { children: React.ReactNode; to?: string }) {
  const { isAuthenticated, sessionReady } = useAuth()
  const location = useLocation()
  if (!sessionReady) {
    return (
      <ServiceStatusPage
        title="Connexion…"
        message="Vérification de votre session en cours."
      />
    )
  }
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

/** Shell utilisateur + pages publiques. Produits = lazy (et bientôt apps/web-*). */
export function UserAppRoutes() {
  return (
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
          <Route
            path="drive"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DrivePage />
              </Suspense>
            }
          />
          <Route path="corbeille" element={<Navigate to="/app/drive?view=trash" replace />} />
          <Route
            path="office"
            element={
              <Suspense fallback={<RouteFallback />}>
                <OfficePage />
              </Suspense>
            }
          />
          <Route
            path="office/editor/:nodeId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <DocumentEditorPage />
              </Suspense>
            }
          />
          <Route
            path="pass"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PassPage />
              </Suspense>
            }
          />
          <Route
            path="mail"
            element={
              <Suspense fallback={<RouteFallback />}>
                <MailPage />
              </Suspense>
            }
          />
          <Route
            path="calendar"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CalendarPage />
              </Suspense>
            }
          />
          <Route
            path="notes"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NotesPage />
              </Suspense>
            }
          />
          <Route
            path="tasks"
            element={
              <Suspense fallback={<RouteFallback />}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="contacts"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ContactsPage />
              </Suspense>
            }
          />
          <Route
            path="photos"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PhotosPage />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsRedirect />} />
          <Route
            path="settings/sec/:token"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SecureSettingsPage />
              </Suspense>
            }
          />
          <Route
            path="settings/canonical"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AppSettingsPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  )
}

/** Applique le thème selon la route /app/* courante. */
function ThemedAppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const appId = cloudityAppIdFromPath(location.pathname)
  return <ThemeProvider appId={appId}>{children}</ThemeProvider>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <StackHealthGate>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <ThemedAppShell>
                <Global401Handler />
                <UserAppRoutes />
              </ThemedAppShell>
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
