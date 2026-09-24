import { createClient } from "@supabase/supabase-js";

/** Cliente privilegiado apenas para rotas de servidor com autenticação própria. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Credenciais de integração Supabase ausentes.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
