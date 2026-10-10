---
'@lonca/core': minor
---

`createRequester` accepts a `rawBody` string that is sent exactly as given (e.g. a SOAP envelope), taking precedence over the JSON-serialised `body`. Set the matching `Content-Type` through `headers`.
