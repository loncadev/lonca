# Changesets

Bu monorepo [Changesets](https://github.com/changesets/changesets) ile versiyonlama ve yayınlama yönetir.

Yayınlanmaya değer bir değişiklik yaptığında:

```bash
pnpm changeset
```

Bu sana değişikliği tarif etmeni soracak. Üretilen changeset dosyası version control'e girer.

Release zamanında:

```bash
pnpm version-packages   # changeset'lere göre versiyonları bump eder
pnpm release            # build alıp publish eder
```
