# Lonca

OSS Türk pazaryeri entegrasyon ekosistemi.

> Türk e-ticaret pazaryerleri için (Trendyol, Hepsiburada, n11, Amazon TR, Pazarama, Çiçeksepeti ve daha fazlası) açık kaynaklı SDK'ler, OpenAPI spec'leri ve entegrasyon araçları.

## Durum

Erken geliştirme aşaması. İlk SDK'ler (Trendyol, Hepsiburada) üzerinde çalışılıyor.

## Vizyon

3 aşamalı yol haritası:

1. **SDK + OpenAPI Spec Collection** — Türk pazaryerleri için tip-güvenli TypeScript/Python SDK'leri ve curated OpenAPI spec'leri
2. **API Drift Detection** — Pazaryeri API'larındaki breaking change'leri proaktif tespit eden monitoring katmanı
3. **Unified Marketplace API Gateway** — Tüm pazaryerlerini tek API arkasında birleştiren abstraction

## Neden?

Türk e-ticaret pazaryerlerinin API'leri fragmente, dokümantasyonu eksik ve sürekli değişiyor. Her e-ticaret geliştiricisi aynı entegrasyon kodunu sıfırdan yazıyor. Mevcut çözümler ya kapalı kaynak vendor-locked (IdeaSoft, T-Soft) ya da Türk pazaryerlerini desteklemiyor (Zapier, Make, n8n).

Lonca bu boşluğu topluluk tarafından maintain edilen açık standartla doldurmayı hedefliyor.

## Paketler

| Paket | Açıklama | Versiyon |
|---|---|---|
| `@lonca/trendyol` | Trendyol Marketplace API SDK | Geliştirme aşamasında |
| `@lonca/hepsiburada` | Hepsiburada Marketplace API SDK | Planlama aşamasında |

## Geliştirme

Gereksinimler:
- Node.js >= 20
- pnpm >= 10

```bash
pnpm install
pnpm build
pnpm test
```

## Katkıda Bulunma

Şu an çekirdek ekip ilk SDK'leri çıkarmaya odaklanmış. Erken katkı için issue açıp tanışalım.

## Lisans

MIT — bkz. [LICENSE](./LICENSE)
