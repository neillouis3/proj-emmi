import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { IconBtn, SelectField } from '@/components/shared/controls'
import { RuleParams } from '@/components/shared/RuleParams'
import { connectorIconTile } from '@/lib/connectorLogos'
import {
  defaultParamsFor,
  parseRulePickerValue,
  ruleById,
  rulePickerValue,
  setRuleCatalog,
  stepFn,
  summarizeStepParams,
} from '@/lib/rules'
import { getInstalledRules, getState } from '@/app/store'
import { allFallbackRules, filterActiveConnectorRules } from '@/lib/ruleDef'
import { normalizeStep } from '@/lib/stepOps'
import type { AutomationStep, RuleDef } from '@/types/domain'

type RuleStepListOpts = {
  steps: AutomationStep[]
  /** @deprecated Prefer per-step connectorId from the selected rule */
  connectorId?: string
  onChange: (steps: AutomationStep[]) => void
}

function catalogRules(): RuleDef[] {
  const state = getState()
  const fromStore = getInstalledRules()
  if (fromStore.length) return fromStore
  return filterActiveConnectorRules(allFallbackRules(), state.connectors)
}

function stepPickerValue(step: AutomationStep) {
  const fn = stepFn(step)
  const cid = step.connectorId || 'fs'
  if (fn.includes('.')) return fn
  return rulePickerValue({ id: fn, connectorId: cid })
}

/** Chain editor: pick a rule per step and bind params. */
export function RuleStepList(opts: RuleStepListOpts) {
  const root = el('div', 'auto-steps')
  let steps = opts.steps.map(normalizeStep)

  const emit = () => opts.onChange(steps.map(normalizeStep))

  const seedCatalog = () => {
    const rules = catalogRules()
    if (rules.length) setRuleCatalog(rules)
    return rules.length > 0
  }

  function paint() {
    root.replaceChildren()

    const list = el('div', 'auto-steps-list')
    steps.forEach((step, index) => {
      list.append(stepCard(step, index))
    })
    root.append(list)

    const add = button('btn btn-ghost auto-steps-add', '+ Add step')
    add.type = 'button'
    add.addEventListener('click', () => {
      const fn = 'list'
      steps = [
        ...steps,
        normalizeStep({
          id: `s${Date.now()}`,
          fn,
          connectorId: 'fs',
          operation: 'list',
          params: '',
          with: defaultParamsFor(fn, 'fs'),
        }),
      ]
      emit()
      paint()
    })
    root.append(add)
  }

  const stepCard = (step: AutomationStep, index: number) => {
    const fn = stepFn(step)
    const def = ruleById(fn, step.connectorId)
    const card = el('div', 'auto-step-card')
    card.dataset.step = String(index)

    const head = el('div', 'auto-step-head')
    head.append(
      el('span', 'auto-step-index', [String(index + 1)]),
      connectorIconTile(step.connectorId || 'fs', true),
    )

    const rules = catalogRules()
    const ruleOptions = rules.map((r) => ({
      value: rulePickerValue(r),
      label: rulePickerValue(r),
    }))

    const rulePicker = el('div', 'auto-step-rule-picker')
    rulePicker.append(
      SelectField({
        label: 'Rule',
        value: stepPickerValue(step),
        options: ruleOptions.length
          ? ruleOptions
          : [{ value: 'list', label: 'list' }],
        onChange: (nextValue) => {
          const parsed = parseRulePickerValue(nextValue)
          steps = steps.map((s, i) =>
            i === index
              ? normalizeStep({
                  ...s,
                  fn: parsed.id,
                  operation: parsed.id,
                  connectorId: parsed.connectorId,
                  with: defaultParamsFor(parsed.id, parsed.connectorId),
                  params: '',
                })
              : s,
          )
          emit()
          paint()
        },
      }),
    )
    head.append(rulePicker)

    head.append(
      IconBtn({
        svg: icons.x,
        label: 'Remove step',
        className: 'btn-ghost auto-step-remove',
        icon: false,
        onClick: () => {
          steps = steps.filter((_, i) => i !== index)
          emit()
          paint()
        },
      }),
    )
    card.append(head)

    if (def?.params.length) {
      card.append(
        RuleParams({
          def,
          value: step.with ?? {},
          onChange: (withParams) => {
            steps = steps.map((s, i) =>
              i === index
                ? normalizeStep({
                    ...s,
                    with: withParams,
                    params: summarizeStepParams(fn, withParams),
                  })
                : s,
            )
            emit()
          },
        }),
      )
    }

    return card
  }

  seedCatalog()
  paint()

  return Object.assign(root, {
    setSteps(next: AutomationStep[]) {
      steps = next.map(normalizeStep)
      paint()
    },
    getSteps() {
      return steps.map(normalizeStep)
    },
  })
}
