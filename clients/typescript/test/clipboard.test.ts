import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ClipboardService,
  ClipboardUnavailableError,
  WebClipboard,
  type ClipboardPort,
  type CopiedClip,
} from '../src/clipboard.js';

/** In-memory port; stands in for a native host implementation. */
class FakeClipboard implements ClipboardPort {
  text: string | null = null;
  image: Blob | null = null;
  failWith: Error | null = null;

  async writeText(text: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.text = text;
  }

  async writeImage(image: Blob): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.image = image;
  }

  async readText(): Promise<string> {
    if (this.failWith) throw this.failWith;
    return this.text ?? '';
  }
}

const png = (): Blob => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

test('copies text with no ClipTown account, client, or network', async () => {
  const port = new FakeClipboard();
  const service = new ClipboardService({ port });

  await service.copyText('to the clipboard');

  assert.equal(port.text, 'to the clipboard');
  assert.equal(service.recordsHistory, false);
});

test('copies images, the path an image library uses', async () => {
  const port = new FakeClipboard();
  await new ClipboardService({ port }).copyImage(png());

  assert.equal(port.image?.type, 'image/png');
});

test('records to history only when a recorder is supplied', async () => {
  const port = new FakeClipboard();
  const recorded: CopiedClip[] = [];
  const service = new ClipboardService({
    port,
    recorder: { record: async (copied) => void recorded.push(copied) },
  });

  assert.equal(service.recordsHistory, true);
  await service.copyText('remembered');
  await service.copyImage(png());

  assert.deepEqual(
    recorded.map((entry) => entry.kind),
    ['text', 'image'],
  );
  assert.equal(recorded[0]?.text, 'remembered');
});

test('a history failure never fails the copy the user asked for', async () => {
  const port = new FakeClipboard();
  const errors: unknown[] = [];
  const service = new ClipboardService({
    port,
    recorder: {
      record: async () => {
        throw new Error('history backend down');
      },
    },
    onRecordError: (error) => errors.push(error),
  });

  await service.copyText('still copied');

  assert.equal(port.text, 'still copied');
  assert.equal(errors.length, 1);
});

test('a clipboard failure does propagate', async () => {
  const port = new FakeClipboard();
  port.failWith = new Error('denied');

  await assert.rejects(() => new ClipboardService({ port }).copyText('nope'), /denied/);
});

test('non-PNG images are rejected by the web port rather than silently dropped', async () => {
  const clipboard = new WebClipboard({
    clipboard: { write: async () => {}, writeText: async () => {}, readText: async () => '' },
  } as unknown as Navigator);

  await assert.rejects(
    () => clipboard.writeImage(new Blob([new Uint8Array([1])], { type: 'image/jpeg' })),
    /must be image\/png/,
  );
});

test('a host without the async clipboard API reports unavailability', async () => {
  assert.equal(WebClipboard.isSupported({} as Navigator), false);

  const clipboard = new WebClipboard({} as Navigator);
  await assert.rejects(() => clipboard.writeText('x'), ClipboardUnavailableError);
});
