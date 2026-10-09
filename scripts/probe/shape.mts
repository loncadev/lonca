/**
 * The structural summariser now lives in `@lonca/drift` (`packages/drift/src/shape.ts`)
 * so the probe runner and the drift engine share one definition of the snapshot format.
 * Re-exported here to keep the probe's local imports stable.
 */
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
} from '@lonca/drift';
