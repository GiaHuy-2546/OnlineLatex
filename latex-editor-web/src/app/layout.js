import './globals.css';

export const metadata = {
  title: 'LaTeX Online - Realtime Collaborative LaTeX Studio',
  description: 'Trình biên tập và biên dịch LaTeX thời gian thực với Monaco Editor và Tectonic Engine.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100 h-screen overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}

