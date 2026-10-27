import { useId, type KeyboardEvent, type ReactNode } from 'react';

/** An underlined text field with a label, used on the sign-in and profile pages. */
export function Line(props: {
  label: string;
  type: string;
  name: string;
  value: string;
  autoComplete: string;
  error?: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyUp?: (e: KeyboardEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const { label, error, onChange, trailing, ...rest } = props;
  return (
    <div className={`line${error ? ' line--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="line__row">
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-e` : undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        {trailing}
      </div>
      <span className="line__rule" />
      {error && (
        <p className="line__error" id={`${id}-e`}>
          {error}
        </p>
      )}
    </div>
  );
}
