export {
  DEFAULT_SUMMARIZE_OPTIONS,
  describe,
  diffShapes,
  mergeShapes,
  summarize,
  type JsonType,
  type Shape,
  type ShapeDiff,
  type ShapeDiffKind,
  type SummarizeOptions,
} from './shape.js';
export {
  getOperation,
  loadSpecs,
  resolveRef,
  responseSchemaFor,
  type OpenApiDocument,
  type MediaTypeObject,
  type OperationObject,
  type SchemaObject,
  type SpecFile,
} from './openapi.js';
export {
  buildOperationIndex,
  defaultHostVariants,
  isUnmatched,
  redactPath,
  type MatchedOperation,
  type OperationIndex,
  type OperationIndexOptions,
  type UnmatchedOperation,
  type WireOperation,
} from './operations.js';
export {
  collapseExchanges,
  createWireRecorder,
  diffWire,
  isSuccess,
  withGlobalFetch,
  type WireBody,
  type WireDiff,
  type WireExchange,
  type WireRecorder,
  type WireRecorderOptions,
} from './wire.js';
export {
  compareResponse,
  DEFAULT_SEVERITY,
  SEVERITIES,
  type CompareInput,
  type Finding,
  type FindingKind,
  type Severity,
} from './engine.js';
export {
  buildDriftReport,
  renderMarkdown,
  shouldFail,
  type DriftReport,
  type FailOn,
  type MarketplaceReport,
  type OperationReport,
  type ProbeSnapshot,
} from './report.js';
export { runCli } from './cli.js';
