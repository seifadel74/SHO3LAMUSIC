export const EMBED_COLORS = {
  primary: 0x5865F2,
  success: 0x57F287,
  error: 0xED4245,
  warning: 0xFEE75C,
} as const;

export const TIMEOUTS = {
  idle: 300_000,
  interaction: 15_000,
} as const;

export const MAX_QUEUE_SIZE = 500 as const;
export const QUEUE_PAGE_SIZE = 10 as const;
