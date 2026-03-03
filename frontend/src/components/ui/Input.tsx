import { forwardRef } from "react";
import {
  Input as BaseInput,
  type InputProps as BaseInputProps,
} from "@klukvas/flux-b2c-ui";

export type InputProps = BaseInputProps;

export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <BaseInput ref={ref} {...props} />
));

Input.displayName = "Input";
