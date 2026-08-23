import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Button as BaseButton } from "@klukvas/flux-b2c-ui";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "destructive"
    | "danger"
    | "success"
    | "outline"
    | "ghost"
    | "link";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const sizeMap = {
  sm: "sm" as const,
  md: "default" as const,
  lg: "lg" as const,
};

// Apple "Response": feedback lives on the press and is instant. `transition`
// keeps the base color transitions and adds transform; `motion-safe` opts out
// of the scale under prefers-reduced-motion.
const pressFeedback =
  "transition duration-100 ease-out motion-safe:active:scale-[0.97]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <BaseButton
      ref={ref}
      variant={variant}
      size={sizeMap[size]}
      className={className ? `${pressFeedback} ${className}` : pressFeedback}
      {...props}
    />
  ),
);

Button.displayName = "Button";
