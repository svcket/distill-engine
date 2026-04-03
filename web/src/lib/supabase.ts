import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Supabase Engine Error: Missing NEXT_PUBLIC_SUPABASE_URL in server environment.')
}

if (!supabaseServiceKey) {
  throw new Error('Supabase Engine Error: Missing SUPABASE_SERVICE_ROLE_KEY. Storage bridge operations will fail.')
}

// Service role client for administrative tasks (like storage bucket management)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Standard client for client-side operations (optional)
export const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
