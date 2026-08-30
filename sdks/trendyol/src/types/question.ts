/**
 * Trendyol customer Q&A types.
 *
 * Customers can post product questions on Trendyol; sellers reply via
 * `questions.answer()`. Status lifecycle:
 *   `WAITING_FOR_ANSWER` → seller replies → `ANSWERED`
 *                       → reported by another seller / Trendyol → `REPORTED`
 *                       → rejected by Trendyol moderation → `REJECTED`
 */
import type { CursorPaginationParams, MutationResult } from '@lonca/core';

export type QuestionStatus =
  'WAITING_FOR_ANSWER' | 'ANSWERED' | 'REJECTED' | 'REPORTED' | (string & {});

export interface QuestionAnswer {
  text?: string;
  /** ISO 8601 UTC (converted from `creationDate` ms-epoch). */
  createdAt?: string;
  status?: string;
}

/**
 * Result of `questions.answer()`. Trendyol's `answerQuestion` reference
 * documents the response as `{ answerId: number }`; `raw` keeps the
 * untouched body in case the gateway returns more (or nothing).
 */
export interface AnswerQuestionResult extends MutationResult {
  /** ID of the answer Trendyol created (absent when the body had none). */
  answerId?: number;
}

export interface Question {
  id: string;
  text?: string;
  customerId?: string;
  /** Masked customer display name. */
  userName?: string;
  showUserName?: boolean;
  status?: QuestionStatus;
  /** Whether the question is visible publicly. */
  public?: boolean;
  productMainId?: string;
  productName?: string;
  imageUrl?: string;
  webUrl?: string;
  /** ISO 8601 UTC (from ms-epoch). */
  createdAt?: string;
  /** Trendyol's pre-formatted "answered on ..." message (Turkish). */
  answeredDateMessage?: string;
  answer?: QuestionAnswer;
  rejectedAnswer?: QuestionAnswer;
  /** ISO 8601 UTC if the question was rejected. */
  rejectedAt?: string;
  reason?: string;
  reportReason?: string;
  /** ISO 8601 UTC if the question was reported. */
  reportedAt?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

export interface ListQuestionsParams extends CursorPaginationParams {
  /** Filter to questions about a specific product barcode. */
  barcode?: string;
  startDate?: Date;
  endDate?: Date;
  /** Filter by current status. */
  status?: QuestionStatus;
}
