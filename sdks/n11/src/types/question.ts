import type { CursorPaginationParams } from '@lonca/core';

/** Question status filter. n11 defaults to `OPEN` when none is sent. */
export type N11QuestionStatus = 'OPEN' | 'CLOSED' | (string & {});

/** Filters for {@link QuestionsResource.list}. */
export interface ListN11QuestionsParams extends CursorPaginationParams {
  /**
   * Window start — **required** by n11. A `Date` is sent as its Turkish
   * calendar day (`DD/MM/YYYY`); a string is sent as given.
   */
  startDate: Date | string;
  /** Window end — **required** by n11. */
  endDate: Date | string;
  /** Defaults to `OPEN` server-side. */
  status?: N11QuestionStatus;
  /** n11 product code. */
  productId?: string | number;
  buyerEmail?: string;
  subject?: string;
}

/** One row of `GetProductQuestionList`. */
export interface N11Question {
  id: string;
  productId?: string;
  productTitle?: string;
  subject?: string;
  question?: string;
  /** Present once answered. */
  answer?: string;
  images: string[];
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}

/** `GetProductQuestionDetail`: the question plus buyer and status fields. */
export interface N11QuestionDetail {
  /** The id that was asked for (the response does not repeat it). */
  id: string;
  productId?: string;
  productTitle?: string;
  subject?: string;
  question?: string;
  answer?: string;
  /** Buyer's name. */
  fullName?: string;
  /** Buyer's e-mail. */
  email?: string;
  productStatus?: string;
  status?: string;
  /** As sent by n11 (format unverified). */
  questionDate?: string;
  /** As sent by n11 (format unverified). */
  answeredDate?: string;
  /** Whether the seller's answer is shown publicly. */
  sellerExpose?: string;
  /** Whether the buyer shared the question publicly ("Özel / Genel"). */
  buyerExpose?: string;
  images: string[];
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}
