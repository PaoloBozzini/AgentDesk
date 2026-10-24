/**
 * Prefilled starting points for a new agent: the trigger (when it runs) on top
 * of newAgentForm() (Script mode with a stub, PATH with Homebrew). The create
 * flow adds the label and log paths, so a template is enough for a working agent.
 */
import { newAgentForm } from './agent-defaults'
import { emptyCalendarEntry, type AgentForm } from './agent-form'

export type TemplateId = 'run-at-login' | 'interval' | 'schedule' | 'watch-path' | 'keep-alive'

export interface TemplateContext {
  /** User home directory, for path defaults. */
  home: string
}

export interface AgentTemplate {
  id: TemplateId
  name: string
  description: string
  build(ctx: TemplateContext): AgentForm
}

function withForm(patch: (form: AgentForm) => void): AgentForm {
  const form = newAgentForm()
  patch(form)
  return form
}

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  {
    id: 'run-at-login',
    name: 'Run at login',
    description: 'Runs once each time you log in.',
    build: () =>
      withForm((f) => {
        f.runAtLoad = 'true'
      })
  },
  {
    id: 'interval',
    name: 'Run every N minutes',
    description: 'Runs repeatedly at a fixed interval (default 15 minutes).',
    build: () =>
      withForm((f) => {
        f.startInterval = String(15 * 60)
      })
  },
  {
    id: 'schedule',
    name: 'Run on a schedule',
    description: 'Runs at set times, like a cron job (default every day at 09:00).',
    build: () =>
      withForm((f) => {
        f.startCalendarInterval = [{ ...emptyCalendarEntry(), hour: '9', minute: '0' }]
      })
  },
  {
    id: 'watch-path',
    name: 'Run when a path changes',
    description: 'Runs whenever a file or folder is modified (default ~/Downloads).',
    build: ({ home }) =>
      withForm((f) => {
        f.watchPaths = [`${home.replace(/\/+$/, '')}/Downloads`]
      })
  },
  {
    id: 'keep-alive',
    name: 'Keep alive',
    description: 'Starts at login and is restarted whenever it exits.',
    build: () =>
      withForm((f) => {
        f.runAtLoad = 'true'
        f.keepAlive.mode = 'always'
      })
  }
]

export function getTemplate(id: TemplateId): AgentTemplate {
  const template = AGENT_TEMPLATES.find((t) => t.id === id)
  if (!template) throw new Error(`Unknown template: ${id}`)
  return template
}
