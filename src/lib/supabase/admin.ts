import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database' //This will error, need to define database type in types/database.ts

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
