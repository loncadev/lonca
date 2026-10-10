---
'@lonca/hepsiburada': minor
---

`questions.list()` / `questions.get()` now expose the fields Hepsiburada actually returns (the documented `IssueViewModel`, verified on SIT): `issueNumber`, `subject`, `lastContent`, `conversations` (the question thread, including answers), `product` (`sku`, `name`, `imageUrl`, `stockCode`), `customerId`, `orderNumber`, `lineItemId`, `createdAt`, `lastModifiedAt`, `expireDate` and `didCustomerSeeTheMessage`. New exported types: `QuestionConversation`, `QuestionProduct`, `QuestionSubject`.

Deprecated: `number`, `productSku` and `createdDate` were never sent by Hepsiburada — they are now filled from `issueNumber`, `product.sku` and `createdAt`; use those instead. `text` and `answer` have no single equivalent (read `conversations`) and stay unset unless a response carries them.
