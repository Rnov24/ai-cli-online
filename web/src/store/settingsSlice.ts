import type { StateCreator } from 'zustand';
import type { ServerSession } from '../types';
import { saveFontSize } from '../api/settings';
import { sessionsApi } from '../api/apiClient';
import type { AppState, SettingsSlice } from './types';

let fontSizeTimer: ReturnType<typeof setTimeout> | null = null;

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  // --- Font size --------------------------------------------------------------

  fontSize: 14,

  setFontSize: (size) => {
    const clamped = Math.max(10, Math.min(24, size));
    set({ fontSize: clamped });
    if (fontSizeTimer) clearTimeout(fontSizeTimer);
    fontSizeTimer = setTimeout(() => {
      fontSizeTimer = null;
      const token = get().token;
      if (token) {
        saveFontSize(token, clamped);
      }
    }, 500);
  },

  // --- Network ----------------------------------------------------------------

  latency: null,
  setLatency: (latency) => set({ latency }),

  // --- Theme ------------------------------------------------------------------

  theme: (() => {
    try {
      const saved = localStorage.getItem('ai-cli-online-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return 'dark';
  })() as 'dark' | 'light',

  setTheme: (theme) => {
    set({ theme });
    try { localStorage.setItem('ai-cli-online-theme', theme); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme);
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // --- Sidebar ----------------------------------------------------------------

  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  serverSessions: [],

  fetchSessions: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const data = await sessionsApi.list<ServerSession[]>(token);
      set({ serverSessions: data });
    } catch {
      // ignore fetch errors
    }
  },
});
