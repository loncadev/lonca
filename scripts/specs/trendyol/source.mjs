/**
 * Hand-maintained inputs for `scripts/specs/build-trendyol.mjs`.
 *
 * Everything that is NOT in the portal's machine-readable reference capture
 * lives here, in plain reviewable JavaScript (no YAML parser is needed, comments
 * are allowed, and eslint/prettier check it like any other repo source):
 *
 *   - `SERVICES`          portal API definition title -> output file name
 *   - `USER_AGENT_PARAMETER`  the `User-Agent` header every request must carry,
 *                         compiled from the portal's "2. Authorization" guide
 *   - `GUIDE_DOCUMENTS`   operations that the portal documents only in prose
 *                         guides (no API reference page), compiled by hand
 *   - `PROBE_OBSERVATIONS`  where each contract-probe snapshot's raw wire object
 *                         lives in the spec, so fields seen on prod but absent
 *                         from the docs can be added as `x-lonca-observed`
 *
 * See specs/trendyol/README.md for how these are applied.
 */

const PORTAL = 'https://developers.trendyol.com';

/**
 * Portal API definition (`info.title` of each reference page's OpenAPI document,
 * which is also the `## API Reference: <title>` heading in llms.txt) -> file.
 * Trendyol groups its reference pages into these definitions itself; each one
 * becomes one standalone OpenAPI document. A definition missing from this map
 * makes the build fail so a new portal group is never silently dropped.
 */
export const SERVICES = {
  'Trendyol Marketplace Entegrasyonu': 'marketplace.json',
  'Trendyol Marketplace - Ürün Entegrasyonu API': 'product.json',
  'Trendyol İhracat Merkezi (AutoFT) Entegrasyonu': 'export-center.json',
  "Trendyol Webhook API'si": 'webhook.json',
  "Trendyol Test Sipariş API'si": 'test-order.json',
  'Fatura Entegrasyonu (Invoice Integration)': 'invoice.json',
  'Trendyol Marketplace - Satıcı Bilgileri Entegrasyonu': 'seller-info.json',
  'Trendyol Marketplace - Ortak Etiket Barkod Entegrasyonu': 'common-label.json',
  'Trendyol Express Entegrasyonu': 'trendyol-express.json',
  'Trendyol Pazaryeri - Müşteri Soruları Entegrasyonu': 'customer-questions.json',
  'Trendyol Yurtiçi Cari Hesap Ekstresi Entegrasyonu': 'current-account-statement.json',
  'Trendyol Yurtiçi Kargo Faturası Detayları Entegrasyonu': 'cargo-invoice.json',
};

/**
 * `User-Agent` is mandatory on every request (403 without it) but no reference
 * page declares it, so the build adds this parameter to every operation.
 * Text follows the "Auth ve User-Agent Kullanımı" section of the guide.
 */
export const USER_AGENT_PARAMETER = {
  name: 'User-Agent',
  in: 'header',
  required: true,
  description:
    'Trendyol Partner API isteklerinde zorunludur; User-Agent bilgisi olmayan istekler 403 ile ' +
    'engellenir. Aracı (entegratör) firma ile çalışılıyorsa "{sellerId} - {Entegratör Firma İsmi}", ' +
    'entegrasyon yazılımı firmaya aitse "{sellerId} - SelfIntegration" gönderilmelidir. ' +
    'Entegratör firma ismi alfanumerik, en fazla 30 karakter olmalıdır.',
  schema: { type: 'string' },
  example: '1234 - SelfIntegration',
  'x-lonca-doc-url': `${PORTAL}/docs/2-authorization`,
};

const VIDEO_DOC = `${PORTAL}/docs/seller-integration-video-api`;
const ENV_DOC = `${PORTAL}/docs/3-canl%C4%B1-test-ortam-bilgileri`;

const videoStatus = {
  type: 'string',
  enum: ['IN_PROGRESS', 'SUCCESS', 'FAILED'],
  description:
    'IN_PROGRESS: video indiriliyor veya işleniyor; SUCCESS: video başarıyla indirildi; ' +
    'FAILED: video indirme işlemi başarısız oldu.',
};

/**
 * Definitions the portal publishes only as prose guides. Each entry is compiled
 * field-by-field from the linked guide page (tables, example requests and
 * responses); nothing here comes from the SDK. Fields the guide does not type
 * explicitly are noted in their `description`.
 */
export const GUIDE_DOCUMENTS = [
  {
    file: 'video.json',
    guide: 'seller-integration-video-api',
    // `updatedAt` of the guide page this entry was compiled against. The build
    // warns when the captured page is newer, i.e. the entry needs a re-review.
    compiledAgainst: '2026-07-03T07:18:02.000Z',
    document: {
      openapi: '3.0.3',
      info: {
        title: 'Trendyol Video Oluşturma / Listeleme Servisi',
        version: '1.0.0',
        description:
          'Entegrasyon servisleri aracılığıyla satıcıların/entegratörlerin ürünler için video ' +
          'içeriği oluşturması ve videoların alınması için kullanılan servis. Bu tanım portalın ' +
          'API reference bölümünde yayımlanmadığı için rehber sayfasından derlenmiştir.',
      },
      servers: [
        { url: 'https://apigw.trendyol.com/integration/video', description: 'Canlı Ortam' },
        {
          url: 'https://stageapigw.trendyol.com/integration/video',
          description:
            'Test Ortamı (rehber yalnızca canlı URL veriyor; test host\'u "3. Canlı-Test Ortam ' +
            'Bilgileri" sayfasındaki genel stageapigw adresinden türetildi)',
          'x-lonca-doc-url': ENV_DOC,
        },
      ],
      tags: [{ name: 'Video', description: 'Ürün videosu oluşturma ve listeleme' }],
      paths: {
        '/sellers/{sellerId}/videos': {
          get: {
            tags: ['Video'],
            summary: 'Videoları Listeleme / Sorgulama',
            description:
              'Satıcının entegrasyon videolarını listeler. Opsiyonel filtrelerle belirli bir video ' +
              "ID veya status'e göre sorgulama yapılabilir. 1000 req/min rate limit belirlenmiştir.",
            operationId: 'getVideos',
            parameters: [
              { $ref: '#/components/parameters/sellerId' },
              {
                name: 'id',
                in: 'query',
                required: false,
                description: 'Belirli bir video ID ile sorgulama',
                schema: { type: 'string' },
              },
              {
                name: 'sellerIntegrationStatus',
                in: 'query',
                required: false,
                description: 'Entegrasyon durumuna göre filtreleme',
                schema: videoStatus,
              },
              {
                name: 'page',
                in: 'query',
                required: false,
                description: "Sayfa numarası (0'dan başlar)",
                schema: { type: 'integer', default: 0 },
              },
              {
                name: 'size',
                in: 'query',
                required: false,
                description: 'Sayfa başına kayıt sayısı',
                schema: { type: 'integer', default: 10 },
              },
            ],
            responses: {
              200: {
                description: 'Başarılı',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/VideoListResponse' },
                    example: {
                      meta: { page: 0, total: 2, totalPage: 1, size: 10 },
                      data: [
                        {
                          id: '627b8a1b-7bad-4eaf-9abb-99a9958540c2',
                          title: 'Ürün Tanıtım Videosu',
                          description: 'Yeni sezon ürün tanıtımı',
                          status: 'SUCCESS',
                          videoUrl: 'https://cdn.example.com/video.mp4',
                          productContentIds: ['123456'],
                          optimizedVideoUrl: 'https://video-content.dsmcdn.com/.../video_hd.mp4',
                          isApproved: true,
                        },
                        {
                          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                          title: 'Montaj Videosu',
                          description: '',
                          status: 'FAILED',
                          videoUrl: 'https://cdn.example.com/montaj.avi',
                          productContentIds: ['789012'],
                          errorCode: 'video.content.api.seller.integration.video.format.invalid',
                          isApproved: false,
                        },
                      ],
                    },
                  },
                },
              },
            },
            'x-lonca-doc-url': VIDEO_DOC,
          },
          post: {
            tags: ['Video'],
            summary: 'Video Oluşturma',
            description:
              "Video içeriği oluşturma işlemini başlatır. Video, verilen URL'den indirilir ve arka " +
              'planda işlenir. 200 req/min rate limit belirlenmiştir. Bir satıcı aynı ' +
              'productContentId için sadece 1 aktif (silinmemiş ve reddedilmemiş) video ' +
              'oluşturabilir. İşlemin durumu dönen videoId ile listeleme servisinden kontrol ' +
              'edilmelidir. Video dosyası .mp4 veya .mov, en fazla 500 MB, 8–120 saniye olmalıdır.',
            operationId: 'createVideo',
            parameters: [{ $ref: '#/components/parameters/sellerId' }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateVideoRequest' },
                  example: {
                    title: 'Ürün Tanıtım Videosu',
                    description: 'Yeni sezon ürün tanıtımı',
                    videoUrl: 'https://cdn.example.com/video.mp4',
                    productContentIds: ['123456', '789012'],
                    videoContentType: 'PRODUCT_PROMOTION',
                  },
                },
              },
            },
            responses: {
              200: {
                description:
                  'Video içeriği oluşturulur ve videoId döner. Videonun indirilmesi ve işlenmesi ' +
                  'arka planda devam eder.',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateVideoResponse' },
                    example: { videoId: '627b8a1b-7bad-4eaf-9abb-99a9958540c2' },
                  },
                },
              },
              400: {
                description:
                  'İstek validasyon hatası. Kodlar: seller.integration.title.required, ' +
                  'seller.integration.title.length, seller.integration.description.length, ' +
                  'seller.integration.video.url.required, seller.integration.video.url.invalid, ' +
                  'seller.integration.product.content.ids.required, ' +
                  'seller.integration.product.content.ids.max, seller.integration.body.required, ' +
                  'seller.integration.invalid.status, seller.integration.invalid.store.front.code.',
              },
            },
            'x-lonca-doc-url': VIDEO_DOC,
          },
        },
      },
      components: {
        parameters: {
          sellerId: {
            name: 'sellerId',
            in: 'path',
            required: true,
            description: 'Satıcı ID',
            schema: { type: 'integer', format: 'int64' },
          },
        },
        schemas: {
          CreateVideoRequest: {
            type: 'object',
            required: ['title', 'videoUrl', 'productContentIds'],
            properties: {
              title: {
                type: 'string',
                minLength: 3,
                maxLength: 50,
                description: 'Video başlığı. 3-50 karakter arası olmalıdır.',
              },
              description: {
                type: 'string',
                maxLength: 500,
                description: 'Video açıklaması. En fazla 500 karakter olabilir.',
              },
              videoUrl: {
                type: 'string',
                pattern: '^https?://',
                description:
                  "İndirilecek video dosyasının URL'i. http:// veya https:// ile başlamalıdır.",
              },
              productContentIds: {
                type: 'array',
                maxItems: 100,
                items: { type: 'string' },
                description:
                  "Bir content id'ye yalnızca 1 video yüklenebilir, aynı video maksimum 100 " +
                  'content id\'ye yüklenebilir. (Rehberdeki alan tablosu tipi "string" olarak ' +
                  'veriyor; örnek istek ve yanıt alanları dizi kullanıyor.)',
              },
              videoContentType: {
                type: 'string',
                enum: [
                  'PRODUCT_PROMOTION',
                  'ASSEMBLY_AND_INSTALLATION',
                  'PACKAGING',
                  'STORE_PROMOTION',
                  'ADVERTISEMENT',
                  'PRODUCT_USAGE_AND_EXPERIENCE',
                ],
                default: 'PRODUCT_PROMOTION',
                description: 'Video içerik tipi. Gönderilmezse PRODUCT_PROMOTION olarak atanır.',
              },
            },
          },
          CreateVideoResponse: {
            type: 'object',
            properties: {
              videoId: {
                type: 'string',
                description:
                  "Oluşturulan video içeriğin UUID'si. Bu ID ile GET endpoint'inden durum sorgulanabilir.",
              },
            },
          },
          Video: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Video içerik ID (UUID)' },
              title: { type: 'string', description: 'Video başlığı' },
              description: { type: 'string', description: 'Video açıklaması' },
              status: videoStatus,
              videoUrl: { type: 'string', description: "Verilen orijinal video URL'i" },
              productContentIds: {
                type: 'array',
                items: { type: 'string' },
                description: "İlişkilendirilen ürün içerik ID'leri",
              },
              errorCode: {
                type: 'string',
                description: 'Hata durumunda hata kodu (sadece FAILED durumunda)',
              },
              optimizedVideoUrl: {
                type: 'string',
                nullable: true,
                description:
                  "Optimize edilmiş video URL'i (sadece SUCCESS ve işleme tamamlandıysa)",
              },
              isApproved: {
                type: 'boolean',
                description:
                  'Videonun onay durumu. true ise video yayında, false ise henüz onaylanmamış veya işleniyor.',
              },
            },
          },
          VideoListResponse: {
            type: 'object',
            properties: {
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPage: { type: 'integer' },
                  size: { type: 'integer' },
                },
              },
              data: { type: 'array', items: { $ref: '#/components/schemas/Video' } },
            },
          },
        },
        securitySchemes: {
          basicAuth: {
            type: 'http',
            scheme: 'basic',
            description:
              'Basic Auth ile Satıcı API Key (kullanıcı adı) ve API Secret Key (şifre) kullanılır.',
          },
        },
      },
      security: [{ basicAuth: [] }],
    },
  },
];

/**
 * Contract-probe snapshots (`probe-snapshots/trendyol.json`) record the shape of
 * every SDK read result; where the SDK keeps the untouched wire object on `raw`,
 * that sub-shape is the production response. Each entry says where that raw
 * object sits in the snapshot (`raw`) and in the spec (`file`, `operation`, and
 * `schema` — a path inside the 200 `application/json` schema, `[]` = array item).
 * Probes whose results carry no `raw` (brands, categories) are normalised by the
 * SDK and cannot be compared field-by-field.
 *
 * `guides` lists the prose guide pages of the same operation (matched by slug
 * suffix, so the dotted-İ slugs need not be spelled out). An observed property
 * whose name appears as a JSON key in one of those guides' examples is tagged
 * `x-lonca-guide-example: <guide url>` — documented by example, just not in the
 * reference schema.
 */
export const PROBE_OBSERVATIONS = [
  {
    probe: 'orders.list',
    raw: 'items[].raw',
    file: 'marketplace.json',
    operation: 'get /order/sellers/{sellerId}/orders',
    schema: 'content[]',
    guides: ['sipariş-paketlerini-çekme-getshipmentpackages'],
  },
  {
    probe: 'claims.list',
    raw: 'items[].raw',
    file: 'marketplace.json',
    operation: 'get /order/sellers/{sellerId}/claims',
    schema: 'content[]',
    guides: ['siparişleri-çekme-getclaims'],
  },
  {
    probe: 'locations.getTurkeyCities',
    raw: '[].raw',
    file: 'marketplace.json',
    operation: 'get /member/countries/domestic/TR/cities',
    schema: '[]',
    guides: ['adres-bilgileri'],
  },
  {
    probe: 'products.list',
    raw: 'items[].raw',
    file: 'product.json',
    operation: 'get /product/sellers/{sellerId}/products/approved',
    schema: 'content[]',
    guides: ['ürün-filtreleme-onaylı-ürün-v2'],
  },
  {
    probe: 'questions.list',
    raw: 'items[].raw',
    file: 'customer-questions.json',
    operation: 'get /qna/sellers/{sellerId}/questions/filter',
    schema: 'content[]',
    guides: ['müşteri-sorularını-çekme'],
  },
  {
    probe: 'finance.getSettlements(Sale,7d)',
    raw: 'items[].raw',
    file: 'current-account-statement.json',
    operation: 'get /sellers/{sellerId}/settlements',
    schema: 'content[]',
    guides: ['cari-hesap-ekstresi-entegrasyonu'],
  },
  {
    probe: 'webhooks.list',
    raw: '[].raw',
    file: 'webhook.json',
    operation: 'get /sellers/{sellerId}/webhooks',
    schema: '[]',
    guides: ['webhook-listeleme'],
  },
];
