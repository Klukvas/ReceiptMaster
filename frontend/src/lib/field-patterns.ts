// Deliberately loose: the server decides what is deliverable, these only catch typos.
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the backend's PHONE_PATTERN: digits, spaces and + ( ) . - only.
export const PHONE_SHAPE = /^\+?[\d\s().-]{3,}$/;
