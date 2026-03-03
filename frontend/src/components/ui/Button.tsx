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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", ...props }, ref) => (
    <BaseButton ref={ref} variant={variant} size={sizeMap[size]} {...props} />
  ),
);

Button.displayName = "Button";
