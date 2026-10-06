import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata:Metadata={title:'INDUSTRY — Software that works for itself.',description:'Launch an autonomous Coin business. Define its mission once and observe its work, services and results.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><Shell>{children}</Shell></body></html>;}
