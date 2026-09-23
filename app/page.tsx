import {redirect} from 'next/navigation';
import {getStaff} from '@/lib/auth';
import BookingApp from './booking-app';
export const dynamic='force-dynamic';
export default async function Page() {
  if(!await getStaff()) redirect('/login');
  return <BookingApp/>;
}
