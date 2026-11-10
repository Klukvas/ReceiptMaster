import { Transform } from "class-transformer";
import {
  ValidationOptions,
  registerDecorator,
  ValidationArguments,
} from "class-validator";
import {
  inferTaxIdKind,
  isValidUaIban,
  normalizeIban,
} from "../utils/ua-requisites.util";

// The shape alone; isValidUaIban also checks the mod-97 check digits. A value of the
// right shape that still fails is a typo, which gets its own message.
const UA_IBAN_SHAPE = /^UA\d{27}$/;

/** Compact upper-case IBAN, so "ua21 3223 ..." and the stored value are the same account. */
export const NormalizedIban = (): PropertyDecorator =>
  Transform(({ value }) => normalizeIban(value));

export function IsUaIban(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: "isUaIban",
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: (args: ValidationArguments) =>
          typeof args.value === "string" && UA_IBAN_SHAPE.test(args.value)
            ? "iban check digits do not match: check the IBAN for a typo"
            : "iban must be a valid Ukrainian IBAN (UA + 27 digits)",
        ...options,
      },
      validator: { validate: (value: unknown) => isValidUaIban(value) },
    });
}

/** An 8-digit ЄДРПОУ or a 10-digit РНОКПП; the checksum is not verified. */
export function IsUaTaxId(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: "isUaTaxId",
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} must be 8 digits (ЄДРПОУ) or 10 digits (РНОКПП)`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => inferTaxIdKind(value) !== null,
      },
    });
}
