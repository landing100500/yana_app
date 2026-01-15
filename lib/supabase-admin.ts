import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Для операций удаления используем service_role ключ, если он доступен
// Это обходит RLS политики и гарантирует удаление
export function getSupabaseAdmin() {
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  // Если есть service_role ключ, используем его (обходит RLS)
  if (supabaseServiceRoleKey) {
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  // Иначе используем обычный клиент (может не работать если RLS строгий)
  const { supabase } = require('./supabase');
  return supabase;
}
