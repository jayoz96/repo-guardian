import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const Icon = type === 'success' ? CheckCircle2 : XCircle;
  const colors = type === 'success'
    ? 'bg-score-green/15 border-score-green/40 text-score-green'
    : 'bg-score-red/15 border-score-red/40 text-score-red';

  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg ${colors} animate-slide-in`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
