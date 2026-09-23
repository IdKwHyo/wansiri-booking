import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getStaff} from '@/lib/auth';
import {AuthForm} from '../login/forms';
import {signOut} from '../login/actions';
export const dynamic='force-dynamic';
export default async function Account() {
  const staff=await getStaff();if(!staff)redirect('/login');
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="auth-brand">← Back to bookings</Link><p className="eyebrow">STAFF ACCOUNT</p><h1>Your account</h1><p>{staff.email} · {staff.role==='admin'?'Administrator':'Staff'}</p><AuthForm mode="password"/><form action={signOut}><button className="auth-signout" type="submit">Sign out</button></form></section></main>;
}
