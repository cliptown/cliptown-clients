/**
 * Clipboard capability, usable without a ClipTown account or backend.
 *
 * ClipTown's clipboard behaviour lived only in the Rust CLI (`arboard`), which
 * made it desktop-only and unusable as a dependency. Host applications that
 * want good clipboard action — including ones that never ship the ClipTown app
 * — embed this module instead of installing a second application.
 *
 * The layering is deliberate and one-directional:
 *
 *   ClipboardPort      no auth, no network, no ClipTown account
 *   ClipboardService   the above, plus optional ClipTown history/sync
 *
 * A host that only wants "put this on the clipboard" depends on the port and
 * nothing else. Passing a `CliptownClient` is purely additive.
 */

/** The one image type every clipboard implementation accepts. */
const CLIPBOARD_IMAGE_TYPE = 'image/png';

/**
 * Platform-agnostic clipboard sink.
 *
 * Web hosts use {@link WebClipboard}. Native hosts (Flutter, Electron, a Rust
 * CLI) implement this against their own platform clipboard so callers stay
 * portable.
 */
export interface ClipboardPort {
  writeText(text: string): Promise<void>;
  writeImage(image: Blob): Promise<void>;
  readText(): Promise<string>;
}

export class ClipboardUnavailableError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(
      `clipboard ${operation} is unavailable — it requires a secure context ` +
        `(HTTPS or localhost) and, on most browsers, a user gesture`,
    );
    this.name = 'ClipboardUnavailableError';
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * `navigator.clipboard` implementation.
 *
 * Async clipboard writes must happen in the same task as the user gesture that
 * triggered them, so callers pass data they already hold rather than a promise
 * this class would await first. Safari is the exception: it only honours a
 * write whose `ClipboardItem` value is an unresolved promise, so image writes
 * hand it one directly instead of awaiting the blob.
 */
export class WebClipboard implements ClipboardPort {
  readonly #navigator: Navigator;

  constructor(navigatorImpl?: Navigator) {
    const resolved = navigatorImpl ?? globalThis.navigator;
    if (!resolved) throw new ClipboardUnavailableError('access');
    this.#navigator = resolved;
  }

  /** True when the async clipboard API is present and usable. */
  static isSupported(navigatorImpl?: Navigator): boolean {
    const resolved = navigatorImpl ?? globalThis.navigator;
    return typeof resolved?.clipboard?.writeText === 'function';
  }

  async writeText(text: string): Promise<void> {
    const clipboard = this.#navigator.clipboard;
    if (typeof clipboard?.writeText !== 'function') {
      throw new ClipboardUnavailableError('write');
    }
    try {
      await clipboard.writeText(text);
    } catch (cause) {
      throw new ClipboardUnavailableError('write', cause);
    }
  }

  async writeImage(image: Blob): Promise<void> {
    const clipboard = this.#navigator.clipboard;
    if (typeof clipboard?.write !== 'function' || typeof ClipboardItem !== 'function') {
      throw new ClipboardUnavailableError('image write');
    }
    if (image.type !== CLIPBOARD_IMAGE_TYPE) {
      throw new Error(
        `clipboard images must be ${CLIPBOARD_IMAGE_TYPE}; received "${image.type || 'unknown'}"`,
      );
    }
    try {
      await clipboard.write([new ClipboardItem({ [CLIPBOARD_IMAGE_TYPE]: image })]);
    } catch (cause) {
      throw new ClipboardUnavailableError('image write', cause);
    }
  }

  async readText(): Promise<string> {
    const clipboard = this.#navigator.clipboard;
    if (typeof clipboard?.readText !== 'function') {
      throw new ClipboardUnavailableError('read');
    }
    try {
      return await clipboard.readText();
    } catch (cause) {
      throw new ClipboardUnavailableError('read', cause);
    }
  }
}

/**
 * Re-encode arbitrary image bytes as PNG, which is the only format clipboards
 * accept consistently. Hosts serving JPEG/WebP/GIF (an image library, say) run
 * their bytes through this before {@link ClipboardPort.writeImage}.
 *
 * Requires a DOM. Animation is lost: only the first frame survives.
 */
export async function toClipboardImage(source: Blob): Promise<Blob> {
  if (source.type === CLIPBOARD_IMAGE_TYPE) return source;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new ClipboardUnavailableError('image conversion');
  }
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new ClipboardUnavailableError('image conversion');
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: CLIPBOARD_IMAGE_TYPE });
  } finally {
    bitmap.close();
  }
}

/** What was copied, handed to a {@link ClipRecorder} after the fact. */
export interface CopiedClip {
  kind: 'text' | 'image';
  text?: string;
  image?: Blob;
}

/**
 * Optional history hook.
 *
 * ClipTown stores client-encrypted envelopes, and this package holds no keys,
 * so it cannot build one from plaintext. A host that wants history implements
 * this: encrypt the payload with the keys it owns, then call
 * `CliptownClient.putClip`. Hosts that only want clipboard actions omit it.
 */
export interface ClipRecorder {
  record(copied: CopiedClip): Promise<void>;
}

export interface ClipboardServiceOptions {
  /** Defaults to {@link WebClipboard}. */
  port?: ClipboardPort;
  /**
   * Records copies to ClipTown history. Omit it and the service still copies —
   * this is the difference between an embedded host and the full ClipTown app,
   * not between working and broken.
   */
  recorder?: ClipRecorder;
  /** Called when a history write fails. A copy already succeeded by then. */
  onRecordError?: (error: unknown) => void;
}

/**
 * Clipboard actions with optional ClipTown history.
 *
 * The copy is what the user asked for; recording it is bookkeeping. A history
 * failure therefore never fails the copy — it is reported through
 * `onHistoryError` and the call still resolves.
 */
export class ClipboardService {
  readonly #port: ClipboardPort;
  readonly #history: ClipboardHistorySink | undefined;
  readonly #onHistoryError: (error: unknown) => void;

  constructor(options: ClipboardServiceOptions = {}) {
    this.#port = options.port ?? new WebClipboard();
    this.#history = options.history;
    this.#onHistoryError = options.onHistoryError ?? (() => {});
  }

  /** True when copies are also recorded to ClipTown. */
  get recordsHistory(): boolean {
    return this.#history !== undefined;
  }

  async copyText(text: string): Promise<void> {
    await this.#port.writeText(text);
  }

  /**
   * Copy an image, converting to PNG when the host supplies another format.
   * This is the path an image or meme library uses.
   */
  async copyImage(image: Blob): Promise<void> {
    await this.#port.writeImage(await toClipboardImage(image));
  }

  async paste(): Promise<string> {
    return this.#port.readText();
  }
}
