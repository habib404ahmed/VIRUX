import React, { useState } from 'react'
import {
  Bell,
  MessageSquare,
  ShieldAlert,
  Smartphone,
  CheckCheck,
  Trash2,
  Clock,
  Sparkles,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { ActionButton } from '../components/ActionButton'
import { EmptyState } from '../components/EmptyState'
import type { NotificationItem } from '../types/dashboard'

const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    appName: 'WhatsApp',
    title: 'Development Team',
    body: 'Alex: Android 15 build verified with Compose compiler 2.1.',
    timestamp: '5 mins ago',
    isRead: false,
    category: 'messaging',
  },
  {
    id: 'notif-2',
    appName: 'Google Play Services',
    title: 'Security Recommendation',
    body: '2-Step Verification key updated successfully for virux-504a5.',
    timestamp: '25 mins ago',
    isRead: false,
    category: 'alerts',
  },
  {
    id: 'notif-3',
    appName: 'Telegram',
    title: 'Release Bot',
    body: 'New commit merged into origin/main: Phase 2 UI completed.',
    timestamp: '1 hour ago',
    isRead: true,
    category: 'messaging',
  },
  {
    id: 'notif-4',
    appName: 'VIRUX System Service',
    title: 'Foreground Heartbeat Active',
    body: 'Device connection established over local Wi-Fi subnet.',
    timestamp: '3 hours ago',
    isRead: true,
    category: 'system',
  },
]

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
  const [activeCategory, setActiveCategory] = useState<'all' | 'messaging' | 'alerts' | 'system'>('all')

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  const clearAll = () => {
    setNotifications([])
  }

  const toggleReadStatus = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
    )
  }

  const filteredNotifications = notifications.filter((item) => {
    if (activeCategory === 'all') return true
    return item.category === activeCategory
  })

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <PageContainer>
      {/* ─── Page Title Header ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Notification Mirror
            </h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Cross-device push notification mirroring (Demonstration preview · Android NotificationListener & FCM in Phase 6).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <ActionButton
              label="Mark all read"
              icon={CheckCheck}
              variant="secondary"
              size="sm"
              onClick={markAllAsRead}
            />
          )}
          {notifications.length > 0 && (
            <ActionButton
              label="Clear all"
              icon={Trash2}
              variant="danger"
              size="sm"
              onClick={clearAll}
            />
          )}
        </div>
      </div>

      {/* ─── Category Filter Tabs ────────────────────────────── */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs self-start overflow-x-auto max-w-full">
        {(['all', 'messaging', 'alerts', 'system'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg capitalize font-medium transition ${
              activeCategory === cat
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ─── Notifications List or Empty State ───────────────── */}
      {filteredNotifications.length > 0 ? (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => {
            const isMsg = notif.category === 'messaging'
            const isAlert = notif.category === 'alerts'
            const CategoryIcon = isMsg ? MessageSquare : isAlert ? ShieldAlert : Smartphone

            return (
              <div
                key={notif.id}
                onClick={() => toggleReadStatus(notif.id)}
                className={`virux-card p-4 transition-all duration-200 flex items-start gap-3.5 cursor-pointer hover:border-slate-700 ${
                  notif.isRead ? 'opacity-70 bg-slate-900/40' : 'virux-glow-primary'
                }`}
                style={{ backgroundColor: 'var(--color-card)' }}
              >
                {/* Category Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isAlert
                      ? 'rgba(239, 68, 68, 0.12)'
                      : isMsg
                      ? 'rgba(99, 102, 241, 0.15)'
                      : 'rgba(6, 182, 212, 0.12)',
                    border: `1px solid ${
                      isAlert
                        ? 'rgba(239, 68, 68, 0.25)'
                        : isMsg
                        ? 'rgba(99, 102, 241, 0.3)'
                        : 'rgba(6, 182, 212, 0.25)'
                    }`,
                  }}
                >
                  <CategoryIcon
                    className="w-5 h-5"
                    style={{
                      color: isAlert ? '#EF4444' : isMsg ? '#818CF8' : '#06B6D4',
                    }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">
                      {notif.appName}
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {notif.timestamp}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-sm font-semibold text-slate-100">{notif.title}</h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{notif.body}</p>
                </div>

                {/* Unread dot */}
                {!notif.isRead && (
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0 mt-1.5 animate-pulse" />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No Notifications"
          description={
            activeCategory !== 'all'
              ? `No notifications found in the "${activeCategory}" category.`
              : 'You are all caught up! New Android device notifications will stream here in real-time once Phase 6 is implemented.'
          }
          actionLabel={notifications.length === 0 ? 'Restore Demo Notifications' : undefined}
          actionIcon={Sparkles}
          onAction={() => setNotifications(initialNotifications)}
        />
      )}
    </PageContainer>
  )
}
export default NotificationsPage
