import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type NotificationItem = {
  id: string
  title: string
  message: string
  read: boolean
  createdAt: string
  type?: 'info' | 'success' | 'warning' | 'error'
}

type NotificationsContextValue = {
  notifications: NotificationItem[]
  addNotification: (n: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const addNotification = useCallback((n: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => {
    const item: NotificationItem = {
      ...n,
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      read: false,
      createdAt: new Date().toISOString(),
    }
    setNotifications((prev) => [item, ...prev].slice(0, 50))
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const value = useMemo(
    () => ({ notifications, addNotification, markAsRead, markAllAsRead }),
    [notifications, addNotification, markAsRead, markAllAsRead]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  return ctx
}
