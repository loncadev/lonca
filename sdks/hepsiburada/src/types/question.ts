/**
 * Hepsiburada "Ask the Seller" types (`saticiya-sor-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `saticiya-sor-entegrasyonu` v1.0.
 *
 * Six endpoints — list / get / create / answer / reject / count-by-status
 * for buyer questions posted on product pages.
 */

/**
 * Query parameters for `questions.list()`.
 *
 * The Ask-the-Seller API pages with `page`/`size` and filters creation dates
 * with `minCreatedAt`/`maxCreatedAt` (verified on SIT 2026-08-30).
 */
export interface ListQuestionsParams {
  /** Filter by status (`WaitingForAnswer`, `Answered`, `Reported`, …). */
  status?: string;
  /** @deprecated Alias of {@link minCreatedAt}. */
  beginDate?: string;
  /** @deprecated Alias of {@link maxCreatedAt}. */
  endDate?: string;
  /** @deprecated Alias of {@link page}. */
  offset?: number;
  /** @deprecated Alias of {@link size}. */
  limit?: number;
  /** Zero-based page number. */
  page?: number;
  /** Page size. */
  size?: number;
  /** ISO date-time — questions created at/after this instant. */
  minCreatedAt?: string;
  /** ISO date-time — questions created at/before this instant. */
  maxCreatedAt?: string;
}

/** Body for `questions.create()` — typically `{ productSku, question }`. */
export type CreateQuestionInput = Record<string, unknown>;

/** Body for `questions.answer()` — typically `{ answer }`. */
export type AnswerQuestionInput = Record<string, unknown>;

/** Body for `questions.reject()` — typically `{ reasonCode, reason }`. */
export type RejectQuestionInput = Record<string, unknown>;

/** One question row. */
export interface Question {
  number?: string;
  status?: string;
  text?: string;
  answer?: string;
  productSku?: string;
  createdDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Per-status count summary returned by `questions.getCountByStatus()`. */
export interface QuestionCountSummary {
  totalCount?: number;
  byStatus?: Record<string, number>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}
