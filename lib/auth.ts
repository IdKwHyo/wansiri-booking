import 'server-only';
import {authClient,authConfigured} from './supabase/server';
import {authorizedStaff} from './authorization';
import {db} from './db';
export async function getStaff() {
  if (!authConfigured()) return null;
  const supabase = await authClient();
  const {data:{user},error} = await supabase.auth.getUser();
  if (error || !user) return null;
  return authorizedStaff(db(), user);
}
