import { mkdtemp, mkdir, rm, symlink, writeFile, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertWritablePath,
  isInside,
  PathRestrictionError,
  resolveRealPath,
  writeRootsFor
} from './paths'

let base: string
let roots: string[]
let outside: string

beforeEach(async () => {
  // tmpdir lives under /var -> /private/var, so realpath handling is exercised
  base = await mkdtemp(join(tmpdir(), 'agentdesk-paths-'))
  const home = join(base, 'home')
  roots = writeRootsFor(home)
  await mkdir(roots[0], { recursive: true }) // LaunchAgents exists
  await mkdir(join(home, 'Library', 'Logs'), { recursive: true }) // Logs exists
  // Application Support/Agent Desk intentionally missing
  await mkdir(join(home, 'Library', 'Application Support'), { recursive: true })
  outside = join(base, 'outside')
  await mkdir(outside)
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('writeRootsFor', () => {
  it('lists the three allowed roots', () => {
    expect(writeRootsFor('/Users/x')).toEqual([
      '/Users/x/Library/LaunchAgents',
      '/Users/x/Library/Application Support/Agent Desk',
      '/Users/x/Library/Logs'
    ])
  })
})

describe('isInside', () => {
  it.each([
    ['/a/b/c', '/a/b', true],
    ['/a/b', '/a/b', true],
    ['/a/bc', '/a/b', false],
    ['/a', '/a/b', false],
    ['/a/b/../c', '/a/b', false]
  ])('%s in %s -> %s', (child, parent, expected) => {
    expect(isInside(child, parent)).toBe(expected)
  })
})

describe('resolveRealPath', () => {
  it('resolves an existing path through symlinked ancestors', async () => {
    const real = await resolveRealPath(roots[0])
    expect(real).toBe(await realpath(roots[0]))
    expect(real.startsWith('/private/')).toBe(true)
  })

  it('resolves a non-existing path via its nearest existing ancestor', async () => {
    const target = join(roots[1], 'backups', 'x.plist')
    const real = await resolveRealPath(target)
    expect(real).toBe(
      join(
        await realpath(join(base, 'home', 'Library', 'Application Support')),
        'Agent Desk',
        'backups',
        'x.plist'
      )
    )
  })
})

describe('assertWritablePath', () => {
  it('allows a new plist in LaunchAgents', async () => {
    const p = await assertWritablePath(join(roots[0], 'com.example.a.plist'), roots)
    expect(p.endsWith('/LaunchAgents/com.example.a.plist')).toBe(true)
  })

  it('allows an existing file in LaunchAgents', async () => {
    const file = join(roots[0], 'com.example.a.plist')
    await writeFile(file, '')
    await expect(assertWritablePath(file, roots)).resolves.toBe(await realpath(file))
  })

  it('allows a not-yet-created app support folder', async () => {
    await expect(
      assertWritablePath(join(roots[1], 'backups', 'b.plist'), roots)
    ).resolves.toBeTruthy()
  })

  it('allows nested log folders', async () => {
    await expect(
      assertWritablePath(join(roots[2], 'com.example.a', 'stdout.log'), roots)
    ).resolves.toBeTruthy()
  })

  it('rejects paths outside all roots', async () => {
    await expect(assertWritablePath(join(outside, 'x.plist'), roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects ../ traversal', async () => {
    await expect(assertWritablePath(join(roots[0], '..', '..', 'x'), roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects a sibling with a shared prefix', async () => {
    await expect(assertWritablePath(roots[0] + 'Evil/x.plist', roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects a symlinked file that points outside', async () => {
    const link = join(roots[0], 'com.example.link.plist')
    await symlink(join(outside, 'target.plist'), link)
    await expect(assertWritablePath(link, roots)).rejects.toThrow(PathRestrictionError)
  })

  it('rejects writing through a symlinked directory that points outside', async () => {
    const link = join(roots[2], 'escape')
    await symlink(outside, link)
    await expect(assertWritablePath(join(link, 'stdout.log'), roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('allows a symlink that stays inside the roots', async () => {
    const target = join(roots[0], 'real.plist')
    await writeFile(target, '')
    const link = join(roots[0], 'alias.plist')
    await symlink(target, link)
    await expect(assertWritablePath(link, roots)).resolves.toBe(await realpath(target))
  })

  it('follows a root that is itself a symlink (dotfiles setups)', async () => {
    const dotfiles = join(base, 'dotfiles', 'LaunchAgents')
    await mkdir(dotfiles, { recursive: true })
    await rm(roots[0], { recursive: true })
    await symlink(dotfiles, roots[0])
    const p = await assertWritablePath(join(roots[0], 'com.example.a.plist'), roots)
    expect(p).toBe(join(await realpath(dotfiles), 'com.example.a.plist'))
  })

  it('rejects system folders', async () => {
    await expect(assertWritablePath('/Library/LaunchAgents/x.plist', roots)).rejects.toThrow(
      PathRestrictionError
    )
    await expect(assertWritablePath('/Library/LaunchDaemons/x.plist', roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects relative paths', async () => {
    await expect(assertWritablePath('Library/LaunchAgents/x.plist', roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects NUL bytes', async () => {
    await expect(assertWritablePath(join(roots[0], 'a\0b'), roots)).rejects.toThrow(
      PathRestrictionError
    )
  })

  it('rejects non-strings', async () => {
    await expect(assertWritablePath(42 as unknown as string, roots)).rejects.toThrow(
      PathRestrictionError
    )
  })
})

describe('symlink edge cases', () => {
  it('rejects a dangling symlink whose target is outside', async () => {
    const link = join(roots[0], 'dangling.plist')
    await symlink(join(outside, 'nope', 'missing.plist'), link)
    await expect(assertWritablePath(link, roots)).rejects.toThrow(PathRestrictionError)
  })

  it('rejects symlink loops', async () => {
    const a = join(roots[0], 'a.plist')
    const b = join(roots[0], 'b.plist')
    await symlink(b, a)
    await symlink(a, b)
    await expect(assertWritablePath(a, roots)).rejects.toThrow(PathRestrictionError)
  })
})
