import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Profile } from '../workspace/profiles.js';

export interface OpenPageOptions {
  /** Absolute URL to navigate to after the page exists. Omit to open a blank page. */
  readonly url?: string;
  readonly profile?: Profile | null;
  /** Load the profile's storage state into the new context. */
  readonly useStorageState?: boolean;
  readonly headed?: boolean;
  /** Join a running browser over the Chrome DevTools Protocol instead of launching. */
  readonly attach?: { readonly cdpEndpoint: string; readonly urlContains?: string };
  readonly navigationTimeoutMs?: number;
}

export interface PageHandle {
  readonly pageId: string;
  readonly page: Page;
  readonly context: BrowserContext;
  readonly browser: Browser;
  readonly attached: boolean;
  readonly profile: Profile | null;
  readonly openedAt: string;
}

/**
 * The one piece of process state the server keeps between calls. Pages are
 * addressed by pageId; everything else (snapshots, memory, receipts) is on
 * disk. Attached browsers are never closed by Tesseract, only disconnected.
 */
export interface BrowserPool {
  open(options: OpenPageOptions): Promise<PageHandle>;
  /** Navigate an existing page. */
  navigate(pageId: string, url: string, timeoutMs?: number): Promise<PageHandle>;
  /** Throws ToolError('not-found') for an unknown or closed pageId. */
  get(pageId: string): PageHandle;
  list(): readonly PageHandle[];
  close(pageId: string): Promise<void>;
  closeAll(): Promise<void>;
}
