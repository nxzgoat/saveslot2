import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { CelebrationProvider } from './components/Celebrate';
import { applyTheme, getTheme } from './lib/theme';
import './styles.css';

applyTheme(getTheme());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <CelebrationProvider>
            <App />
          </CelebrationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
