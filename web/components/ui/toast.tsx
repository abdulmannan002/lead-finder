'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}

const ToastContext = createContext<{ toast: (message: string, kind?: Toast['kind']) => void }>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++seq.current;
    setToasts((all) => [...all, { id, message, kind }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-toast-in pointer-events-auto rounded-lg border bg-card px-4 py-3 text-sm shadow-lg',
              t.kind === 'success' && 'border-emerald-200',
              t.kind === 'error' && 'border-red-200',
            )}
          >
            <span
              className={cn(
                'mr-2 inline-block h-2 w-2 rounded-full align-middle',
                t.kind === 'success' && 'bg-emerald-500',
                t.kind === 'error' && 'bg-red-500',
                t.kind === 'info' && 'bg-sky-500',
              )}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
