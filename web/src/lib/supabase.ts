import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Supabase Engine Error: Missing NEXT_PUBLIC_SUPABASE_URL in server environment.')
}

// Service role client for administrative tasks - ONLY available on the server
export const supabaseAdmin = (typeof window === 'undefined' && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

// Standard client for client-side operations (uses public anon key)
export const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
