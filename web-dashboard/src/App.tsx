// ============================================================
// VIRUX Web Dashboard — Application Router
//
// Phase 3: Real Authentication Guards & Protected Routing
// ============================================================

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DeviceProvider } from './context/DeviceContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicOnlyRoute } from './components/PublicOnlyRoute'
import { DashboardLayout } from './layouts/DashboardLayout'

// Public Auth Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'

// Protected Dashboard Pages
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import FileTransferPage from './pages/FileTransferPage'
import ScreenMirroringPage from './pages/ScreenMirroringPage'
import NotificationsPage from './pages/NotificationsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <DeviceProvider>
        <Routes>
          {/* Public-only authentication routes */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          {/* Protected Dashboard Routes (requires authenticated Firebase session) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/files" element={<FileTransferPage />} />
              <Route path="/mirror" element={<ScreenMirroringPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {/* Catch-all redirect to root / dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </DeviceProvider>
    </AuthProvider>
  )
}
