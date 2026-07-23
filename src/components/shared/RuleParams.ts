import { el } from '@/lib/dom'
import { PathField, SelectField, TextField } from '@/components/shared/controls'
import { RouteTableField } from '@/components/shared/RouteTableField'
import type { RuleUiDef } from '@/lib/rules'

type RuleParamsOpts = {
  def: RuleUiDef
  value: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

/** Typed parameter inputs for a rule. */
export function RuleParams(opts: RuleParamsOpts) {
  const root = el('div', 'rule-params')
  let values = { ...opts.value }

  const emit = (next: Record<string, unknown>) => {
    values = next
    opts.onChange(next)
  }

  for (const def of opts.def.params) {
    const row = el('div', 'rule-param')

    if (def.type === 'table') {
      row.append(el('span', 'rule-param-label', [def.label]))
      const table = Array.isArray(values.table)
        ? (values.table as { key?: string; value?: string; match?: string; dest?: string }[])
        : typeof values.table === 'object' && values.table
          ? Object.entries(values.table as Record<string, string>).map(([key, value]) => ({
              key,
              value,
            }))
          : []
      const routes = table.map((r) => {
        const row = r as {
          key?: string
          value?: string
          match?: string
          dest?: string
        }
        return {
          match: String(row.key ?? row.match ?? ''),
          dest: String(row.value ?? row.dest ?? ''),
        }
      })
      row.append(
        RouteTableField({
          value: {
            routes: routes.length ? routes : [{ match: '', dest: '' }],
            fallback: String(values.fallback ?? values.default ?? ''),
          },
          onChange: (next) => {
            emit({
              ...values,
              table: Object.fromEntries(
                next.routes
                  .filter((r) => r.match.trim())
                  .map((r) => [r.match.replace(/\s+/g, ''), r.dest]),
              ),
              default: next.fallback,
              fallback: next.fallback,
            })
          },
        }),
      )
    } else if (def.type === 'select' && def.options) {
      const host = el('div', 'rule-param-picker')
      host.append(
        SelectField({
          label: def.label,
          value: String(values[def.key] ?? def.options[0]?.value ?? ''),
          options: def.options,
          onChange: (v) => emit({ ...values, [def.key]: v }),
        }),
      )
      row.append(host)
    } else if (def.type === 'folder' || def.type === 'path') {
      row.append(el('span', 'rule-param-label', [def.label]))
      row.append(
        PathField({
          value: String(values[def.key] ?? ''),
          placeholder: def.placeholder ?? '',
          kind: 'folder',
          title: def.label,
          formatPicked:
            def.key === 'dir' || def.key === 'glob'
              ? (folder) => (folder.endsWith('/*') ? folder : `${folder}/*`)
              : undefined,
          onChange: (v) => emit({ ...values, [def.key]: v }),
        }),
      )
    } else {
      row.append(el('span', 'rule-param-label', [def.label]))
      if (def.type === 'text') {
        row.append(
          TextField({
            value: String(values[def.key] ?? ''),
            placeholder: def.placeholder ?? '',
            multiline: true,
            className: 'rule-param-input',
            onChange: (v) => emit({ ...values, [def.key]: v }),
          }),
        )
      } else {
        const raw = values[def.key]
        const display = Array.isArray(raw)
          ? raw.map(String).join(' ')
          : String(raw ?? '')
        row.append(
          TextField({
            value: display,
            placeholder: def.placeholder ?? '',
            className: 'rule-param-input',
            onChange: (v) => emit({ ...values, [def.key]: v }),
          }),
        )
      }
    }

    root.append(row)
  }

  return root
}
