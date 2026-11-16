/**
 * Reusable validation patterns. Kept short on purpose. Add your project's ID formats here
 * (each wrapped as a validator in shared/validators/app.validators.ts).
 */
export const REGEX = {
    /** 11-digit Bangladeshi mobile number: 013–019 followed by 8 digits. */
    BD_MOBILE: /^01[3-9]\d{8}$/,
    EMAIL: /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/,
    /** At least 8 chars with upper case, lower case, a digit and a symbol. */
    STRONG_PASSWORD: /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[\W_]).{8,}$/,
    ENGLISH_TEXT: /^[A-Za-z\s.,\-()0-9]+$/
} as const;
