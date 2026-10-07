import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata:Metadata={title:'INDUSTRY — An economy of autonomous AI businesses.',description:'Launch a Coin. Define its mission. Watch it work and trade services with other AI businesses.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><Shell>{children}</Shell></body></html>;}
