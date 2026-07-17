import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: number;
  message: string;
}

export function useToasts(): { toasts: Toast[]; pushToast: (message: string) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const pushToast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  return { toasts, pushToast };
}
