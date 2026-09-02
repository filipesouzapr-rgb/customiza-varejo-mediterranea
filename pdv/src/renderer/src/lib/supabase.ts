import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.RENDERER_VITE_SUPABASE_URL
const anonKey = import.meta.env.RENDERER_VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anonKey)
