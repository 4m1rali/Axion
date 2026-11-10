import type { InputHTMLAttributes, ReactNode } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label?: ReactNode;
  labelClassName?: string;
  className?: string;
};

function CheckboxTick() {
  return (
    <svg className="axion-checkbox__tick" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function AxionCheckbox({
  label,
  labelClassName,
  className = "",
  disabled,
  id,
  ...inputProps
}: Props) {
  return (
    <label
      className={`axion-checkbox group inline-flex cursor-pointer items-start gap-2.5 select-none ${
        disabled ? "axion-checkbox--disabled cursor-not-allowed opacity-45" : ""
      } ${className}`}
    >
      <span className="relative mt-0.5 block h-[18px] w-[18px] shrink-0">
        <input type="checkbox" id={id} disabled={disabled} className="axion-checkbox__input" {...inputProps} />
        <span className="axion-checkbox__box">
          <CheckboxTick />
        </span>
      </span>
      {label != null ? (
        <span className={`text-xs leading-snug text-axion-text-secondary ${labelClassName ?? ""}`}>{label}</span>
      ) : null}
    </label>
  );
}
