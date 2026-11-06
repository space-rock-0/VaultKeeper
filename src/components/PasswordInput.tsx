import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { PasswordEyeIcon } from "./icons/PasswordEyeIcon";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { id, className = "form-control", disabled, ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return <div className="relative">
    <input {...props} id={inputId} ref={ref} disabled={disabled} type={visible ? "text" : "password"} className={`${className} !pr-12`} />
    <button
      type="button"
      disabled={disabled}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      aria-controls={inputId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setVisible((current) => !current)}
      className="password-visibility-toggle absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-slate-500 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:text-indigo-300"
    >
      <PasswordEyeIcon hidden={!visible} className="h-5 w-5" />
    </button>
  </div>;
});

export default PasswordInput;
