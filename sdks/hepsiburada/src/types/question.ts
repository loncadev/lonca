/**
 * Hepsiburada "Ask the Seller" types (`saticiya-sor-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `saticiya-sor-entegrasyonu` v1.0.
 *
 * Six endpoints — list / get / create / answer / reject / count-by-status
 * for buyer questions posted on product pages.
 */

/** Query parameters for `questions.list()`. */
export interface ListQuestionsParams {
  /** Filter by status (`Open`, `Answered`, `Rejected`, …). */
  status?: string;
  beginDate?: string;
  endDate?: string;
  offset?: number;
  limit?: number;
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
