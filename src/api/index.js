import { createLiveApi } from './supabase.js'
import { createDemoApi } from './demo.js'

// Connection comes from build settings (VITE_…) or, for drag-and-drop hosting, from public/config.js
const cfg = (typeof window !== 'undefined' && window.PT_CONFIG) || {}
const url = import.meta.env.VITE_SUPABASE_URL || cfg.supabaseUrl
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || cfg.supabaseAnonKey

// Live database when keys are configured; otherwise a fully working on-device demo.
export const api = url && key ? createLiveApi(url, key) : createDemoApi()
export const isDemo = api.mode === 'demo'
