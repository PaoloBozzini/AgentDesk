import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

// Security guard rails (#35). Processes: execFile/spawn with argument arrays only.
const CHILD_PROCESS = ['child_process', 'node:child_process']
const NO_SHELL = CHILD_PROCESS.map((name) => ({
  name,
  importNames: ['exec', 'execSync'],
  message: 'Use execFile/spawn with an argument array, never a shell string.'
}))
const PROCESS_CALLS = '/^(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)$/'
const SHELL_OPTION =
  "ObjectExpression > Property[key.name='shell'][value.type='Literal'][value.value!=false]"
const NO_SHELL_SYNTAX = [
  `CallExpression[callee.name=${PROCESS_CALLS}] > ${SHELL_OPTION}`,
  `CallExpression[callee.property.name=${PROCESS_CALLS}] > ${SHELL_OPTION}`
].map((selector) => ({
  selector,
  message: 'Never run processes through a shell (shell must be false or absent).'
}))

// Filesystem writes: only in the audited services below, all behind the path restriction.
const FS_WRITES = [
  'appendFile',
  'appendFileSync',
  'chmod',
  'chmodSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'createWriteStream',
  'link',
  'linkSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'rename',
  'renameSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'symlink',
  'symlinkSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'writeFile',
  'writeFileSync'
]
const NO_FS_WRITES = ['fs', 'fs/promises', 'node:fs', 'node:fs/promises'].map((name) => ({
  name,
  importNames: FS_WRITES,
  message:
    'Writes belong in an audited service that calls assertWritablePath (see eslint.config.mjs).'
}))
const WRITE_SITES = [
  'src/main/services/backup.ts',
  'src/main/services/create.ts',
  'src/main/services/logDirs.ts',
  'src/main/services/plutil.ts',
  'src/main/services/save.ts'
]

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...NO_SHELL, ...NO_FS_WRITES] }],
      'no-restricted-syntax': ['error', ...NO_SHELL_SYNTAX]
    }
  },
  {
    // Audited write sites: each one checks its target with assertWritablePath (paths.ts)
    files: [...WRITE_SITES, 'src/**/*.test.ts', 'src/main/services/__integration__/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: NO_SHELL }]
    }
  },
  {
    files: ['scripts/**/*.{cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)
