import type { Toast } from '../useArena';
import { Icon } from './Icons';

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)}>
          <span className="toast-icon">
            <Icon name={toast.kind === 'error' ? 'close' : toast.kind === 'success' ? 'check' : 'activity'} size={14} />
          </span>
          <span>{toast.text}</span>
          <Icon name="close" size={12} className="toast-close" />
        </button>
      ))}
    </div>
  );
}
