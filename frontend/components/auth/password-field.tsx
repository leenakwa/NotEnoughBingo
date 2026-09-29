"use client";

import { useId, useState, type ChangeEventHandler } from "react";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="field password-field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <div className="password-field__control">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          aria-controls={id}
          aria-describedby={`${id}-label`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}
