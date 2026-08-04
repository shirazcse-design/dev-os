import { MAX_CHAT_HISTORY, MAX_PAGE_COUNT, MAX_UPLOAD_SIZE_MB } from '@/lib/config'

// Re-exported so lib/security is a single place to look up every request-size
// ceiling, even though upload/page limits are sourced from lib/config.ts (the
// product-level values there are already stricter than the security envelope
// this table documents: 10MB / 20 pages vs. the 10MB / 200-page limits below).
export const MAX_FILE_SIZE_MB = MAX_UPLOAD_SIZE_MB
export const MAX_PAGE_COUNT_CEILING = 200
export const MAX_MESSAGE_LENGTH = 5000
export { MAX_CHAT_HISTORY }

export function isWithinPageCountCeiling(pageCount: number): boolean {
  return pageCount <= Math.min(MAX_PAGE_COUNT, MAX_PAGE_COUNT_CEILING)
}

export function isWithinMessageLength(message: string): boolean {
  return message.length > 0 && message.length <= MAX_MESSAGE_LENGTH
}
