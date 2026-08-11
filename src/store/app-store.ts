import { create } from 'zustand'

export type ActivePage =
  | 'dashboard'
  | 'devices'
  | 'meter'
  | 'paper-analytics'
  | 'settings'

interface AppState {
  activePage: ActivePage
  sidebarOpen: boolean
  setActivePage: (page: ActivePage) => void
  toggleSidebar: () => void
  closeSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activePage: 'dashboard',
  sidebarOpen: false,
  setActivePage: (page) => set({ activePage: page }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
}))
