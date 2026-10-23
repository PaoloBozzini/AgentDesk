import { appendFile, chmod, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FileStatus } from '../../../shared/log-types'
import { FileTail } from './fileTail'

let dir: string
let file: string
let tail: FileTail | undefined
let view: string
let statuses: FileStatus[]
let resets: number

const handlers = {
  onReset: (text: string) => {
    view = text
    resets++
  },
  onAppend: (text: string) => {
    view += text
  },
  onStatus: (s: FileStatus) => statuses.push(s)
}

const waitFor = async (check: () => boolean, timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out; view=${JSON.stringify(view)}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agentdesk-tail-'))
  file = join(dir, 'stdout.log')
  view = ''
  statuses = []
  resets = 0
})

afterEach(async () => {
  tail?.stop()
  await chmod(file, 0o644).catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

const startTail = async (options = {}): Promise<FileTail> => {
  tail = new FileTail(file, handlers, { pollMs: 20, ...options })
  await tail.start()
  return tail
}

describe('FileTail', () => {
  it('shows existing content, then appends', async () => {
    await writeFile(file, 'one\n')
    await startTail()
    expect(view).toBe('one\n')
    await appendFile(file, 'two\n')
    await waitFor(() => view === 'one\ntwo\n')
    expect(statuses.at(-1)).toEqual({ state: 'ok', size: 8 })
  })

  it('shows only the last initialBytes of a big file', async () => {
    await writeFile(file, 'a'.repeat(100) + 'TAIL')
    await startTail({ initialBytes: 10 })
    expect(view).toBe('aaaaaaTAIL')
  })

  it('waits for a missing file and picks it up when created', async () => {
    await startTail()
    expect(statuses).toEqual([{ state: 'missing' }])
    await writeFile(file, 'hello\n')
    await waitFor(() => view === 'hello\n')
  })

  it('resets on truncation', async () => {
    await writeFile(file, 'old content\n')
    await startTail()
    await writeFile(file, 'new\n')
    await waitFor(() => view === 'new\n')
    expect(resets).toBeGreaterThanOrEqual(2)
  })

  it('resets on rotation (new inode)', async () => {
    await writeFile(file, 'before rotation\n')
    await startTail()
    await rename(file, file + '.1')
    await writeFile(file, 'after\n')
    await waitFor(() => view === 'after\n')
  })

  it('clears and reports missing when the file is deleted', async () => {
    await writeFile(file, 'x\n')
    await startTail()
    await rm(file)
    await waitFor(() => statuses.at(-1)?.state === 'missing')
    expect(view).toBe('')
  })

  it('reports an unreadable file without throwing', async () => {
    await writeFile(file, 'secret\n')
    await chmod(file, 0o000)
    await startTail()
    expect(statuses.at(-1)).toMatchObject({ state: 'unreadable' })
    expect(view).toBe('')
  })

  it('reports a directory as not-a-file', async () => {
    file = dir
    await startTail()
    expect(statuses).toEqual([{ state: 'not-a-file' }])
  })

  it('decodes multi-byte characters split across reads', async () => {
    await writeFile(file, '')
    await startTail()
    const euro = Buffer.from('€') // 3 bytes
    await appendFile(file, euro.subarray(0, 1))
    await new Promise((r) => setTimeout(r, 60))
    await appendFile(file, Buffer.concat([euro.subarray(1), Buffer.from(' ok')]))
    await waitFor(() => view === '€ ok')
  })

  it('caps a single read to maxReadBytes and catches up over several polls', async () => {
    await writeFile(file, '')
    await startTail({ maxReadBytes: 4 })
    await appendFile(file, '0123456789')
    await waitFor(() => view === '0123456789')
  })

  it('emits nothing after stop(), even from a read already in flight', async () => {
    await writeFile(file, 'content')
    tail = new FileTail(file, handlers, { pollMs: 20 })
    const started = tail.start()
    tail.stop()
    await started
    expect(view).toBe('')
    expect(statuses).toEqual([])
  })

  it('stops polling after stop()', async () => {
    await writeFile(file, 'a')
    await startTail()
    tail!.stop()
    await appendFile(file, 'b')
    await new Promise((r) => setTimeout(r, 100))
    expect(view).toBe('a')
  })
})
