import { execFileSync } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildBinary } from 'plist'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  detectFormat,
  MAX_PLIST_BYTES,
  parsePlistBuffer,
  parsePlistXml,
  PlistError,
  readPlistFile,
  serializePlist
} from './plist'

const FIXTURE = join(__dirname, '__fixtures__', 'plist', 'full-agent.plist')
const isMac = process.platform === 'darwin'

let fixtureXml: string
let dir: string

beforeAll(async () => {
  fixtureXml = await readFile(FIXTURE, 'utf8')
  dir = await mkdtemp(join(tmpdir(), 'agentdesk-plist-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('parsePlistXml', () => {
  it('parses all common LaunchAgent keys', () => {
    const d = parsePlistXml(fixtureXml)
    expect(d.Label).toBe('com.agentdesk.test.full')
    expect(d.ProgramArguments).toEqual(['/bin/sh', '-c', 'echo "hi & bye" > /dev/null'])
    expect(d.RunAtLoad).toBe(true)
    expect(d.KeepAlive).toEqual({
      SuccessfulExit: false,
      PathState: { '/tmp/agentdesk-flag': true }
    })
    expect(d.StartInterval).toBe(300)
    expect(d.StartCalendarInterval).toEqual([{ Hour: 9, Minute: 0 }, { Weekday: 1 }])
    expect(d.EnvironmentVariables).toEqual({ PATH: '/usr/bin:/bin', GREETING: 'ciao è ü 🚀' })
    expect(d.Nice).toBe(-5)
    expect(d.ExitTimeOut).toBe(2.5)
    expect(d.Created).toEqual(new Date('2026-10-23T10:00:00Z'))
    expect(Buffer.from(d.Blob as Uint8Array).toString()).toBe('hello')
    expect(d.EmptyDict).toEqual({})
    expect(d.EmptyArray).toEqual([])
    expect(d.EmptyString).toBe('')
  })

  it.each([
    ['garbage', 'not xml'],
    ['unclosed', '<plist><dict><key>a</key>'],
    ['empty', '']
  ])('throws PlistError on %s input', (_n, xml) => {
    expect(() => parsePlistXml(xml)).toThrow(PlistError)
  })

  it('rejects a non-dict root', () => {
    expect(() =>
      parsePlistXml('<plist version="1.0"><array><string>x</string></array></plist>')
    ).toThrow(/root must be a <dict>/)
  })
})

describe('round-trip', () => {
  it('parse -> serialize -> parse is stable', () => {
    const once = parsePlistXml(fixtureXml)
    const xml = serializePlist(once)
    const twice = parsePlistXml(xml)
    expect(twice).toEqual(once)
    expect(serializePlist(twice)).toBe(xml)
  })

  it('escapes XML special characters', () => {
    const xml = serializePlist({ Label: 'a', S: '<tag> & "q" \'a\'' })
    expect(xml).not.toContain('<tag>')
    expect(parsePlistXml(xml).S).toBe('<tag> & "q" \'a\'')
  })

  it('writes the Apple plist header', () => {
    const xml = serializePlist({ Label: 'a' })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"')
  })
})

describe('binary plists', () => {
  it('detects formats', () => {
    expect(detectFormat(Buffer.from('bplist00....'))).toBe('binary')
    expect(detectFormat(Buffer.from(fixtureXml))).toBe('xml')
    expect(detectFormat(Buffer.alloc(0))).toBe('xml')
  })

  it('parses binary and exposes normalized XML', () => {
    const data = parsePlistXml(fixtureXml)
    const parsed = parsePlistBuffer(buildBinary(data as never))
    expect(parsed.format).toBe('binary')
    expect(parsed.data).toEqual(data)
    expect(parsePlistXml(parsed.xml)).toEqual(data)
  })

  it('throws PlistError on corrupt binary', () => {
    expect(() => parsePlistBuffer(Buffer.from('bplist00garbage'))).toThrow(PlistError)
  })
})

describe('parsePlistBuffer', () => {
  it('keeps original XML text for XML files', () => {
    expect(parsePlistBuffer(Buffer.from(fixtureXml)).xml).toBe(fixtureXml)
  })

  it('rejects oversized files', () => {
    expect(() => parsePlistBuffer(Buffer.alloc(MAX_PLIST_BYTES + 1))).toThrow(/too large/)
  })
})

describe.runIf(isMac)('plutil cross-check', () => {
  it('our serialized output passes plutil -lint', async () => {
    const file = join(dir, 'out.plist')
    await writeFile(file, serializePlist(parsePlistXml(fixtureXml)))
    expect(() => execFileSync('/usr/bin/plutil', ['-lint', file])).not.toThrow()
  })

  it('reads a binary file produced by plutil', async () => {
    const file = join(dir, 'bin.plist')
    await writeFile(file, fixtureXml)
    execFileSync('/usr/bin/plutil', ['-convert', 'binary1', file])
    const parsed = await readPlistFile(file)
    expect(parsed.format).toBe('binary')
    expect(parsed.data).toEqual(parsePlistXml(fixtureXml))
  })
})
