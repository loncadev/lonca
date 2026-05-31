import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  AnswerQuestionInput,
  CreateQuestionInput,
  ListQuestionsParams,
  Question,
  QuestionCountSummary,
  RejectQuestionInput,
} from '../types/question.js';

const SERVICE = 'oms' as const;
const BASE_PATH = '/api/v1.0/issues';

/**
 * Hepsiburada "Ask the Seller" (`saticiya-sor-entegrasyonu`).
 *
 * **Service base URL**: `oms-external[-sit].hepsiburada.com`. 6-endpoint
 * surface — list / get / create / answer / reject / count.
 *
 * NOTE: Sandbox `beekod_dev` merchant doesn't have permission for this
 * surface; SIT calls return `403`. Endpoints typed from the developer-portal
 * spec; live-tested in production by integrators with the right scope.
 */
export class QuestionsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /** List questions with optional status / date filtering. */
  async list(params: ListQuestionsParams = {}): Promise<Question[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: BASE_PATH,
      query: {
        status: params.status,
        beginDate: params.beginDate,
        endDate: params.endDate,
        offset: params.offset,
        limit: params.limit,
      },
      rateLimiter: this.limiter,
    });
    return unwrapQuestionList(data).map(normalizeQuestion);
  }

  /** Get a single question by its issue number. */
  async get(number: string): Promise<Question> {
    if (!number) {
      throw new ValidationError({ message: 'questions.get: number is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(number)}`,
      rateLimiter: this.limiter,
    });
    return normalizeQuestion(data);
  }

  /** Per-status question counts. */
  async getCountByStatus(): Promise<QuestionCountSummary> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/count`,
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: QuestionCountSummary = { raw: obj };
    if (typeof obj.totalCount === 'number') out.totalCount = obj.totalCount;
    if (obj.byStatus && typeof obj.byStatus === 'object') {
      out.byStatus = obj.byStatus as Record<string, number>;
    }
    return out;
  }

  /** Create a new buyer question (rare — usually the buyer creates it). */
  async create(input: CreateQuestionInput): Promise<unknown> {
    this.assertInput(input, 'questions.create');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: BASE_PATH,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Answer a question. */
  async answer(number: string, input: AnswerQuestionInput): Promise<unknown> {
    if (!number) {
      throw new ValidationError({ message: 'questions.answer: number is required' });
    }
    this.assertInput(input, 'questions.answer');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(number)}/answer`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /** Reject a question (mark as inappropriate / spam). */
  async reject(number: string, input: RejectQuestionInput): Promise<unknown> {
    if (!number) {
      throw new ValidationError({ message: 'questions.reject: number is required' });
    }
    this.assertInput(input, 'questions.reject');
    return this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/${encodeURIComponent(number)}/reject`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }
}

function unwrapQuestionList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.issues)) return obj.issues;
  return [];
}

function normalizeQuestion(row: unknown): Question {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: Question = { raw: r };
  if (typeof r.number === 'string') out.number = r.number;
  if (typeof r.status === 'string') out.status = r.status;
  if (typeof r.text === 'string') out.text = r.text;
  if (typeof r.answer === 'string') out.answer = r.answer;
  if (typeof r.productSku === 'string') out.productSku = r.productSku;
  if (typeof r.createdDate === 'string') out.createdDate = r.createdDate;
  return out;
}
