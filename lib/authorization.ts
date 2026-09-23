import type {Database} from './database';
export type Staff = {id:string;email:string;role:'admin'|'staff'};
/** Input must come from Supabase auth.getUser(), never request headers or raw cookies. */
export async function authorizedStaff(database: Database, user: {id:string;email?:string}|null): Promise<Staff|null> {
  if (!user?.email) return null;
  const staff = await database.prepare('SELECT role FROM staff WHERE user_id=? AND active=true').bind(user.id).first();
  if (!staff || !['admin','staff'].includes(staff.role)) return null;
  return {id:user.id,email:user.email,role:staff.role};
}
