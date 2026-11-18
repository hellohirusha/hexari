import { Children, isValidElement, useId, type ReactNode } from "react";

type OptionProps = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
};
export default function InlineChoices({
  value,
  onChange,
  children,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const name = useId();
  const options = Children.toArray(children).filter((child) =>
    isValidElement<OptionProps>(child),
  );
  return (
    <span className="inline-choices" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        if (!isValidElement<OptionProps>(option)) return null;
        const choice = String(
          option.props.value ?? option.props.children ?? "",
        );
        return (
          <span
            className={`inline-choice ${String(value) === choice ? "selected" : ""}`}
            key={choice}
            onClick={() => {
              if (!disabled && !option.props.disabled) onChange(choice);
            }}
          >
            <input
              type="radio"
              name={name}
              value={choice}
              checked={String(value) === choice}
              disabled={disabled || option.props.disabled}
              aria-label={
                typeof option.props.children === "string"
                  ? option.props.children
                  : choice
              }
              onClick={(e) => e.stopPropagation()}
              onChange={() => onChange(choice)}
            />
            <span>{option.props.children}</span>
          </span>
        );
      })}
    </span>
  );
}
