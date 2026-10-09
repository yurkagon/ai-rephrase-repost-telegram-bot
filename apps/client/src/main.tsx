import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-900">
      <h1 className="text-4xl font-semibold">Hello world</h1>
    </main>
  </StrictMode>,
);
