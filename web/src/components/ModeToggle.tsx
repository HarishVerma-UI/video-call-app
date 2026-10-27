import { toggleMode, useMode } from '../theme';

/**
 * One round button. The disc is half sunflower, half teal; switching modes
 * spins it half a turn so the other side faces up.
 */
export function ModeToggle({ className = '' }: { className?: string }) {
  const mode = useMode();
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={`mode ${className}`}
      onClick={() => void toggleMode()}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      data-mode={mode}
      data-testid="mode-toggle"
    >
      <span className="mode__disc" aria-hidden="true" />
    </button>
  );
}
