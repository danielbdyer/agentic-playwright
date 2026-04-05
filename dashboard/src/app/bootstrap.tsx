import { createRoot } from 'react-dom/client';
import { App } from './App';
import { QueryProvider } from './providers/QueryProvider';

export const bootstrapDashboard = (): void => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    return;
  }

  createRoot(rootElement).render(
    <QueryProvider>
      <App />
    </QueryProvider>,
  );
};

// Auto-run on module load (matches legacy shell behavior for ESM script tag)
bootstrapDashboard();
