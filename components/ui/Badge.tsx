import { errorColor, errorLabel } from "@/lib/colors";
import type { ErrorType } from "@/types/index";

interface Props {
  errorType: ErrorType | null;
  size?: "sm" | "md";
}

export function ErrorBadge({ errorType, size = "md" }: Props) {
  const color = errorColor(errorType);
  const label = errorLabel(errorType);
  const pad   = size === "sm" ? "0.08rem 0.35rem" : "0.12rem 0.45rem";
  const fs    = size === "sm" ? "0.6rem" : "0.65rem";

  return (
    <span
      className="badge"
      style={{
        padding: pad,
        fontSize: fs,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}
