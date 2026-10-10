// Fixture for types-extract.test.ts: one declaration per simplification rule.
// Never imported at runtime; only read through the TypeScript compiler API.

export type Status = 'Created' | 'Shipped' | (string & {});

export enum Level {
  Low = 1,
  High = 2,
}

export enum Color {
  Red = 'red',
}

export interface Ref {
  id?: number | string;
  name?: string;
}

export interface Sample {
  id: string;
  count?: number;
  flag?: boolean;
  status?: Status;
  level?: Level;
  color?: Color;
  maybe?: string | null;
  anything?: unknown;
  tags?: string[];
  pairs?: readonly number[];
  tuple?: [string, number];
  refs?: Array<Ref>;
  ref?: Ref;
  inline?: { a?: string; b: number };
  mixed?: { url?: string } | string;
  when?: Date;
  bag?: Record<string, unknown>;
  obj?: object;
  big?: bigint;
  template?: `x-${string}`;
  nothing?: undefined;
  callback?: () => void;
  method(): void;
  child?: Sample;
  children?: Sample[];
  [key: string]: unknown;
}

export type Alias = Ref | null;

export type Intersected = { a?: string } & Record<string, unknown>;

export type Either = { kind: 'a'; a: string } | { kind: 'b'; b: number };

export interface Box<T> {
  value?: T;
}

export interface Merged {
  a?: string;
}

export interface Merged {
  b?: number;
}

export interface Level1 {
  next?: Level2;
}

export interface Level2 {
  next?: Level3;
}

export interface Level3 {
  leaf?: string;
}

export function makeLocal(): unknown {
  interface Local {
    x?: number;
  }
  const value: Local = {};
  return value;
}

export function dupA(): unknown {
  interface Dup {
    a?: string;
  }
  const value: Dup = {};
  return value;
}

export function dupB(): unknown {
  interface Dup {
    b?: string;
  }
  const value: Dup = {};
  return value;
}
