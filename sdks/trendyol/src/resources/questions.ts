import { TokenBucketRateLimiter, ValidationError, type CursorPage } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  ListQuestionsParams,
  Question,
  QuestionAnswer,
  QuestionStatus,
} from '../types/question.js';

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs === 0) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

interface WireAnswer {
  text?: string;
  creationDate?: number;
  status?: string;
}

interface WireQuestion {
  id?: number | string;
  text?: string;
  customerId?: number | string;
  userName?: string;
  showUserName?: boolean;
  status?: string;
  public?: boolean;
  productMainId?: string;
  productName?: string;
  imageUrl?: string;
  webUrl?: string;
  creationDate?: number;
  answeredDateMessage?: string;
  answer?: WireAnswer;
  rejectedAnswer?: WireAnswer;
  rejectedDate?: number;
  reason?: string;
  reportReason?: string;
  reportedDate?: number;
  [key: string]: unknown;
}

function normalizeAnswer(a: WireAnswer | undefined): QuestionAnswer | undefined {
  if (!a) return undefined;
  const out: QuestionAnswer = {};
  if (a.text !== undefined) out.text = a.text;
  const createdAt = toIso(a.creationDate);
  if (createdAt) out.createdAt = createdAt;
  if (a.status !== undefined) out.status = a.status;
  return out;
}

function normalizeQuestion(node: WireQuestion): Question {
  const out: Question = {
    id: node.id !== undefined ? String(node.id) : '',
    raw: node as Record<string, unknown>,
  };
  if (node.text !== undefined) out.text = node.text;
  if (node.customerId !== undefined) out.customerId = String(node.customerId);
  if (node.userName !== undefined) out.userName = node.userName;
  if (typeof node.showUserName === 'boolean') out.showUserName = node.showUserName;
  if (node.status !== undefined) out.status = node.status as QuestionStatus;
  if (typeof node.public === 'boolean') out.public = node.public;
  if (node.productMainId !== undefined) out.productMainId = node.productMainId;
  if (node.productName !== undefined) out.productName = node.productName;
  if (node.imageUrl !== undefined) out.imageUrl = node.imageUrl;
  if (node.webUrl !== undefined) out.webUrl = node.webUrl;
  const createdAt = toIso(node.creationDate);
  if (createdAt) out.createdAt = createdAt;
  if (node.answeredDateMessage !== undefined) out.answeredDateMessage = node.answeredDateMessage;
  const answer = normalizeAnswer(node.answer);
  if (answer) out.answer = answer;
  const rejectedAnswer = normalizeAnswer(node.rejectedAnswer);
  if (rejectedAnswer) out.rejectedAnswer = rejectedAnswer;
  const rejectedAt = toIso(node.rejectedDate);
  if (rejectedAt) out.rejectedAt = rejectedAt;
  if (node.reason !== undefined) out.reason = node.reason;
  if (node.reportReason !== undefined) out.reportReason = node.reportReason;
  const reportedAt = toIso(node.reportedDate);
  if (reportedAt) out.reportedAt = reportedAt;
  return out;
}

/**
 * Trendyol customer Q&A management. Customers post product questions on
 * Trendyol; sellers reply with `questions.answer()`.
 */
export class QuestionsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    private readonly sellerId: number,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 500, intervalMs: 60_000 });
  }

  /** Fetch a single question by its numeric ID. */
  async get(questionId: string | number): Promise<Question> {
    const data = await this.transport.request<WireQuestion>({
      method: 'GET',
      path: `/integration/qna/sellers/${this.sellerId}/questions/${encodeURIComponent(String(questionId))}`,
      rateLimiter: this.limiter,
    });
    return normalizeQuestion(data);
  }

  /**
   * Filter questions by barcode / date range / status. Page-based
   * pagination internally; SDK exposes the opaque-cursor convention.
   */
  async list(params: ListQuestionsParams = {}): Promise<CursorPage<Question>> {
    const size = Math.min(params.limit ?? 50, 200);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    const query: Record<string, string | number | undefined> = { page, size };
    if (params.barcode) query.barcode = params.barcode;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();
    if (params.status) query.status = params.status;

    interface WireResponse {
      totalElements?: number;
      totalPages?: number;
      content?: WireQuestion[];
    }
    const data = await this.transport.request<WireResponse>({
      method: 'GET',
      path: `/integration/qna/sellers/${this.sellerId}/questions/filter`,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map(normalizeQuestion);
    const result: CursorPage<Question> = { items };
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Reply to a question. Trendyol enforces 10–2000 characters on the
   * answer text; the SDK pre-validates client-side.
   *
   * @throws {ValidationError} when `text` is outside the 10–2000 char range.
   */
  async answer(questionId: string | number, text: string): Promise<unknown> {
    if (typeof text !== 'string' || text.length < 10) {
      throw new ValidationError({
        message: `questions.answer: text must be at least 10 chars (got ${text?.length ?? 0})`,
      });
    }
    if (text.length > 2000) {
      throw new ValidationError({
        message: `questions.answer: text must be at most 2000 chars (got ${text.length})`,
      });
    }
    return this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/qna/sellers/${this.sellerId}/questions/${encodeURIComponent(String(questionId))}/answers`,
      body: { text },
      rateLimiter: this.limiter,
    });
  }
}
