/**
 * What the in-page recorder reports, validated on arrival. The page is the
 * application under test: its scripts can call the binding too, so every
 * message is parsed (unknown fields dropped, sizes capped) before Node acts
 * on it.
 */
import { z } from 'zod';
import { AffordanceSchema, NamingSourceSchema } from '../contract/schemas.js';

const text = (max: number) => z.string().max(max);

/** observe's RefDescription, as the walker computes it for the element a user touched. */
export const DescriptorSchema = z.object({
  ref: text(64),
  role: text(64),
  name: text(2_000),
  namingSource: NamingSourceSchema,
  affordance: AffordanceSchema,
  interactive: z.boolean(),
  category: z.enum(['control', 'landmark', 'heading', 'row', 'cell', 'message', 'dialog', 'image']),
  tag: text(64),
  labelText: text(2_000).optional(),
  placeholder: text(500).optional(),
  testId: text(500).optional(),
  testIdAttribute: text(64).optional(),
  id: text(500).optional(),
  idKind: z.enum(['designer', 'structural', 'plain']).optional(),
  landmark: text(64).optional(),
  landmarkName: text(500).optional(),
  dataBlock: text(500).optional(),
  rowText: text(2_000).optional(),
  rowCells: z.array(text(500)).max(32).optional(),
  inputType: text(64).optional(),
  visible: z.boolean(),
});

export type Descriptor = z.infer<typeof DescriptorSchema>;

export const RECORDED_ACTIONS = ['click', 'fill', 'select', 'check', 'uncheck', 'press'] as const;
export type RecordedAction = (typeof RECORDED_ACTIONS)[number];

export const ActionEventSchema = z.object({
  type: z.literal('action'),
  token: text(128),
  doc: text(64),
  seq: z.number().int().min(1),
  action: z.enum(RECORDED_ACTIONS),
  /** Stable per element within one document: "<doc>:<n>". */
  element: text(128).nullable(),
  url: text(8_192),
  at: z.number(),
  snapshotId: text(128).nullable(),
  ref: text(64).nullable(),
  descriptor: DescriptorSchema.nullable(),
  value: text(10_000).optional(),
  secret: z.literal(true).optional(),
  key: text(32).optional(),
});

export type ActionEvent = z.infer<typeof ActionEventSchema>;

export const StopEventSchema = z.object({ type: z.literal('stop'), token: text(128) });

export const HelloEventSchema = z.object({ type: z.literal('hello') });

export const RecorderMessageSchema = z.discriminatedUnion('type', [ActionEventSchema, StopEventSchema, HelloEventSchema]);

export type RecorderMessage = z.infer<typeof RecorderMessageSchema>;

/** What `hello` answers and `configure` receives. */
export interface RecorderConfig {
  readonly active: boolean;
  readonly token?: string;
  readonly redact?: readonly string[];
  readonly stopButton?: boolean;
}

/** Where the element of an event is now, per the in-page `locate`. */
export const LocateResultSchema = z.object({
  known: z.boolean(),
  attached: z.boolean(),
  snapshotId: z.string().nullable(),
  ref: z.string().nullable(),
});

export type LocateResult = z.infer<typeof LocateResultSchema>;

export const NOT_LOCATED: LocateResult = { known: false, attached: false, snapshotId: null, ref: null };
