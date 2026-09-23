import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Clinic / Patient bookings',description:'Patient records, appointments and assisted search.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
