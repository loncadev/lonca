import { TokenBucketRateLimiter, ValidationError, type MutationResult } from '@lonca/core';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  AnswerQuestionInput,
  CreateQuestionInput,
  ListQuestionsParams,
  Question,
  QuestionCountSummary,
  RejectQuestionInput,
} from '../types/question.js';

const SERVICE = 'asktoseller' as const;
const BASE_PATH = '/api/v1.0/issues';

/**
 * Hepsiburada "Ask the Seller" (`saticiya-sor-entegrasyonu`).
 *
 * **Service base URL**: `api-asktoseller-merchant[-sit].hepsiburada.com`
 * (per the portal spec — routing through `oms-external` returns 401 because
 * the routes don't exist there; verified on SIT 2026-08-30, where the
 * rerouted calls answer 200). 6-endpoint surface — list / get / create /
 * answer / reject / count.
 *
 * Every endpoint requires the merchant id in a `merchantId` **header**
 * (missing it yields 401); the SDK sends it automatically.
 */
export class QuestionsResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  /**
   * List questions with optional status / date filtering. Pages with the
   * API's `page`/`size` parameters (the legacy `offset`/`limit` params are
   * kept as aliases).
   */
  async list(params: ListQuestionsParams = {}): Promise<Question[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: BASE_PATH,
      query: {
        status: params.status,
        minCreatedAt: params.minCreatedAt ?? params.beginDate,
        maxCreatedAt: params.maxCreatedAt ?? params.endDate,
        page: params.page ?? params.offset,
        size: params.size ?? params.limit,
      },
      headers: this.merchantHeader(),
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
      headers: this.merchantHeader(),
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
      headers: this.merchantHeader(),
      rateLimiter: this.limiter,
    });
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const out: QuestionCountSummary = { raw: obj };
    if (typeof obj.totalCount === 'number') out.totalCount = obj.totalCount;
    if (obj.byStatus && typeof obj.byStatus === 'object') {
      out.byStatus = obj.byStatus as Record<string, number>;
    } else {
      // The live API answers a flat per-status map, e.g.
      // `{ waitingForAnswer: 1, answered: 2, reported: 0 }` (verified on SIT
      // 2026-08-30) — surface it as `byStatus`.
      const counts: Record<string, number> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') counts[key] = value;
      }
      if (Object.keys(counts).length > 0) out.byStatus = counts;
    }
    return out;
  }

  /**
   * Create a new buyer question. SIT-only: Hepsiburada exposes it so
   * integrators can seed test data (the buyer normally creates questions).
   *
   * Resolves to a `MutationResult`. The spec documents the `201` body as a
   * bare `number[]` without naming the elements, so it is left on `raw`
   * rather than modelled as a field.
   */
  async create(input: CreateQuestionInput): Promise<MutationResult> {
    this.assertInput(input, 'questions.create');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: BASE_PATH,
        body: input,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Answer a question. Resolves to a `MutationResult` (`201`, bare string on `raw`). */
  async answer(number: string, input: AnswerQuestionInput): Promise<MutationResult> {
    if (!number) {
      throw new ValidationError({ message: 'questions.answer: number is required' });
    }
    this.assertInput(input, 'questions.answer');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/${encodeURIComponent(number)}/answer`,
        body: input,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Reject a question (mark as inappropriate / spam). Resolves to a `MutationResult` (`201`, bare string on `raw`). */
  async reject(number: string, input: RejectQuestionInput): Promise<MutationResult> {
    if (!number) {
      throw new ValidationError({ message: 'questions.reject: number is required' });
    }
    this.assertInput(input, 'questions.reject');
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/${encodeURIComponent(number)}/reject`,
        body: input,
        headers: this.merchantHeader(),
        rateLimiter: this.limiter,
      }),
    };
  }

  private assertInput(input: unknown, methodLabel: string): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: `${methodLabel}: input is required` });
    }
  }

  /**
   * The Ask-the-Seller API authenticates the merchant with a required
   * `merchantId` header on every endpoint (401 without it).
   */
  private merchantHeader(): Record<string, string> {
    return { merchantId: this.transport.merchantId };
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
