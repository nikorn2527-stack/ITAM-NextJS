import { create } from 'zustand'

export type ActivePage =
  | 'dashboard'
  | 'devices'
  | 'meter'
  | 'paper-analytics'
  | 'settings'

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
  setSearchOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activePage: 'dashboard',
  sidebarOpen: false,
  pendingDeviceId: null,
  pendingSettingsTab: null,
  pendingWarrantyFilter: null,
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
  setSearchOpen: (open) => set({ searchOpen: open }),
}))
