import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuthContext } from '@/context/AuthContext'
import OpenFromHubPage from '@/pages/OpenFromHubPage'
import { MainLayout } from '@/components/layout/MainLayout'
import type { ReactNode } from 'react'

import './index.css'

function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuthContext()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/open-from-hub" replace />
  }

  return <>{children}</>
}

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/open-from-hub" element={<OpenFromHubPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

