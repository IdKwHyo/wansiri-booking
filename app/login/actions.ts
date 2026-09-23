'use server';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {authClient} from '@/lib/supabase/server';
import {getStaff} from '@/lib/auth';
export type AuthState={error?:string;message?:string};
export async function signIn(_previous:AuthState,form:FormData):Promise<AuthState> {
  const parsed=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)}).safeParse({email:form.get('email'),password:form.get('password')});
  if (!parsed.success) return {error:'Enter your email address and password.'};
  try {
    const client=await authClient();
    const {error}=await client.auth.signInWithPassword(parsed.data);
    if(error) return {error:'Unable to sign in. Check your email and password, or try again shortly.'};
    if(!await getStaff()) {
      await client.auth.signOut({scope:'local'});
      return {error:'This account does not have clinic access. Contact your administrator.'};
    }
  } catch {return {error:'Sign-in is temporarily unavailable. Please try again.'};}
  redirect('/');
}
export async function signOut() {
  const client=await authClient();
  const {error}=await client.auth.signOut({scope:'local'});
  if(error) throw new Error('Unable to sign out. Please retry.');
  redirect('/login');
}
export async function changePassword(_previous:AuthState,form:FormData):Promise<AuthState> {
  const password=String(form.get('password')||''),confirmation=String(form.get('confirmation')||'');
  if(password.length<12 || password.length>128) return {error:'Use a password between 12 and 128 characters.'};
  if(password!==confirmation) return {error:'The passwords do not match.'};
  try {
    if(!await getStaff()) return {error:'Sign in with an approved staff account first.'};
    const client=await authClient();
    const {error}=await client.auth.updateUser({password});
    if(error) return {error:'Unable to change your password. Sign in again and retry, or contact your administrator.'};
    return {message:'Password updated.'};
  } catch {return {error:'Unable to change your password. Please try again.'};}
}
