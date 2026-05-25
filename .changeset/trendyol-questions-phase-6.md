---
'@lonca/trendyol': minor
---

Add **Phase 6 — customer Q&A resource** (3 endpoints).

New top-level `client.questions` resource for the trendyol.com product-questions flow (customers post questions on product pages; sellers reply).

### New methods

- **`questions.get(id)`** → `Question`
  - `GET /integration/qna/sellers/{sellerId}/questions/{id}`

- **`questions.list({ cursor?, limit?, barcode?, startDate?, endDate?, status? })`** → `CursorPage<Question>`
  - `GET /integration/qna/sellers/{sellerId}/questions/filter`
  - Status filter: `'WAITING_FOR_ANSWER' | 'ANSWERED' | 'REJECTED' | 'REPORTED'` (open enum).

- **`questions.answer(id, text)`** → `unknown`
  - `POST /integration/qna/sellers/{sellerId}/questions/{id}/answers` body `{ text }`
  - SDK validates 10 ≤ `text.length` ≤ 2000 before hitting the wire (Trendyol-enforced).

### Smoke verified (STAGE)

```
── 6.89 questions.list({ limit: 2 })
✓ Got 0 question(s)
```

200 OK + empty content — this seller has no customer questions on STAGE. Wire contract fully verified.

### New exports

- Resource: `QuestionsResource`
- Types: `Question`, `QuestionAnswer`, `QuestionStatus`, `ListQuestionsParams`

### Stacks on top of #32 (Phase 5).
