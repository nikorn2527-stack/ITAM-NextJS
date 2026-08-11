import { create } from 'zustand'

export type ActivePage =
  | 'dashboard'
  | 'devices'
  | 'meter'
  | 'paper-analytics'
  | 'settings'
  | 'itam'
  | 'itam-devices'
  | 'itam-meter'
  | 'itam-settings'
  | 'itam-audit'

export type SettingsTab = 'app' | 'master' | 'sites' | 'rates' | 'users' | 'audit'

interface AppState {
  activePage: ActivePage
  sidebarOpen: boolean
  /** A device id that the devices page should auto-open the detail sheet for on mount. */
  pendingDeviceId: string | null
  /** A settings tab to auto-activate on mount. */
  pendingSettingsTab: SettingsTab | null
  /** A warranty status filter to apply on devices page on mount. */
  pendingWarrantyFilter: 'expiring' | 'expired' | null
  /** A meter-page action to auto-run on mount (e.g. 'open-cycle' opens the cycle dialog). */
  pendingMeterAction: string | null
  /** A device-type filter applied to the ITAM devices page on mount (set by dashboard chart click). */
  pendingDeviceType: string | null
  /** A status filter applied to the ITAM devices page on mount (set by dashboard donut click). */
  pendingDeviceStatus: string | null
  /** Set true to open the global search palette from anywhere. */
  searchOpen: boolean
  setActivePage: (page: ActivePage) => void
  toggleSidebar: () => void
  closeSidebar: () => void
  setPendingDeviceId: (id: string | null) => void
  clearPendingDeviceId: () => void
  setPendingSettingsTab: (tab: SettingsTab | null) => void
  clearPendingSettingsTab: () => void
  setPendingWarrantyFilter: (f: 'expiring' | 'expired' | null) => void
  clearPendingWarrantyFilter: () => void
  setPendingMeterAction: (action: string | null) => void
  clearPendingMeterAction: () => void
  setPendingDeviceType: (t: string | null) => void
  clearPendingDeviceType: () => void
  setPendingDeviceStatus: (s: string | null) => void
  clearPendingDeviceStatus: () => void
  setSearchOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activePage: 'dashboard',
  sidebarOpen: false,
  pendingDeviceId: null,
  pendingSettingsTab: null,
  pendingWarrantyFilter: null,
  pendingMeterAction: null,
  pendingDeviceType: null,
  pendingDeviceStatus: null,
  searchOpen: false,
  setActivePage: (page) => set({ activePage: page }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setPendingDeviceId: (id) => set({ pendingDeviceId: id }),
  clearPendingDeviceId: () => set({ pendingDeviceId: null }),
  setPendingSettingsTab: (tab) => set({ pendingSettingsTab: tab }),
  clearPendingSettingsTab: () => set({ pendingSettingsTab: null }),
  setPendingWarrantyFilter: (f) => set({ pendingWarrantyFilter: f }),
  clearPendingWarrantyFilter: () => set({ pendingWarrantyFilter: null }),
  setPendingMeterAction: (action) => set({ pendingMeterAction: action }),
  clearPendingMeterAction: () => set({ pendingMeterAction: null }),
  setPendingDeviceType: (t) => set({ pendingDeviceType: t }),
  clearPendingDeviceType: () => set({ pendingDeviceType: null }),
  setPendingDeviceStatus: (s) => set({ pendingDeviceStatus: s }),
  clearPendingDeviceStatus: () => set({ pendingDeviceStatus: null }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}))
