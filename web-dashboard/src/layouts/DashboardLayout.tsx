import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { PairingModal } from '../components/PairingModal'
import { useDevices } from '../hooks/useDevices'

export const DashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isPairingModalOpen, closePairingModal } = useDevices()

  return (
    <div
      className="min-h-screen flex text-slate-100"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header onToggleSidebar={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Device Pairing Modal */}
      <PairingModal isOpen={isPairingModalOpen} onClose={closePairingModal} />
    </div>
  )
}
