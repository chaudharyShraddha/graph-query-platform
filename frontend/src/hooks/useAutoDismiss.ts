import { useEffect, useRef } from 'react';

/** Schedule onDismiss after delayMs when isActive is true. Cleans up on change or unmount. */
export function useAutoDismiss(isActive: boolean, onDismiss: () => void, delayMs: number) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isActive) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onDismissRef.current(), delayMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isActive, delayMs]);
}
