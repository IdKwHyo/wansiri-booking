import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export function authConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function authClient() {
  if (!authConfigured()) throw new Error('Authentication is not configured');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: {httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', path:'/'},
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        // Server Components cannot set cookies. The page proxy refreshes them.
        try { values.forEach(({name,value,options}) => jar.set(name,value,options)); } catch {}
      },
    },
  });
}
