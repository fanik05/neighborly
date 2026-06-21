'use client';

import { useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Password field with a Show/Hide toggle. Forwards all standard input props
 *  (value, onChange, minLength, required, placeholder, ...). */
export default function PasswordInput(props: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className="field pr-16" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-semibold text-pine hover:text-pine-dark"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
