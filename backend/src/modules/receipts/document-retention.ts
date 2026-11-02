/**
 * How many generated documents an account keeps of each document type. Generating one more
 * retires the oldest of the same type. Counted per type so that an invoice, an act and a
 * waybill for the same order do not push each other (and their public links) out.
 */
export const DOCUMENTS_RETAINED_PER_TYPE = 10;
