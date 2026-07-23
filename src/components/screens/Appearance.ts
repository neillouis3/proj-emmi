import { el, button } from '@/lib/dom'
import { ListRow, SectionBlock } from '@/components/shared/SectionBlock'
import { SelectField, ThemeField } from '@/components/shared/controls'
import { icons } from '@/lib/icons'
import { accentCss, UI_FONT_OPTIONS } from '@/lib/appearance'
import { getState, setAppearancePrefs } from '@/app/store'

export function Appearance() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body settings-page')

  const render = () => {
    const state = getState()
    page.replaceChildren()
    body.replaceChildren()

    const themeControl = ThemeField({ className: 'settings-select', onChange: render })

    const fontControl = SelectField({
      label: 'UI font',
      value: state.appearance.uiFontFamily,
      options: UI_FONT_OPTIONS,
      onChange: (v) => {
        setAppearancePrefs({
          uiFontFamily: v as typeof state.appearance.uiFontFamily,
        })
        render()
      },
    })
    fontControl.classList.add('settings-select')

    const hueColors = accentCss(
      state.appearance.accentHue,
      Math.max(state.appearance.accentIntensity, 35),
    )

    body.append(
      SectionBlock({
        icon: icons.paint,
        tone: 'purple',
        title: 'Colors',
        rows: [
          customRow('Theme', themeControl),
          detailControlRow(
            'Hue',
            'Choose a tint color',
            hueSlider(state.appearance.accentHue, hueColors.accent, (v) => {
              setAppearancePrefs({ accentHue: v })
              render()
            }),
          ),
          detailControlRow(
            'Intensity',
            'Control how strongly the tint is applied',
            intensityControl(state.appearance.accentIntensity, (v) => {
              setAppearancePrefs({ accentIntensity: v })
              render()
            }),
          ),
          detailToggleRow(
            'Reduce Transparency',
            'Replace translucent surfaces with opaque backgrounds',
            state.appearance.reduceTransparency,
            (v) => {
              setAppearancePrefs({ reduceTransparency: v })
              render()
            },
          ),
        ],
      }),
    )

    body.append(
      SectionBlock({
        icon: icons.typography,
        tone: 'blue',
        title: 'Typography',
        rows: [
          detailControlRow(
            'UI Font Size',
            'Font size for the Emmi user interface',
            stepperControl(state.appearance.uiFontSize, 11, 18, (v) => {
              setAppearancePrefs({ uiFontSize: v })
              render()
            }),
          ),
          detailControlRow(
            'UI Font Family',
            'Override the Emmi user interface typeface',
            fontControl,
          ),
          detailToggleRow(
            'Font Smoothing',
            'Use native font anti-aliasing',
            state.appearance.fontSmoothing,
            (v) => {
              setAppearancePrefs({ fontSmoothing: v })
              render()
            },
          ),
        ],
      }),
    )

    page.append(body)
  }

  render()
  return page
}

function detailControlRow(label: string, meta: string, control: HTMLElement) {
  const row = ListRow({ className: 'settings-row-detail' })
  const left = el('div', 'settings-row-copy')
  left.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'settings-row-meta', [meta]),
  )
  const right = el('div', 'settings-row-actions')
  right.append(control)
  row.append(left, right)
  return row
}

function detailToggleRow(
  label: string,
  meta: string,
  value: boolean,
  onChange: (value: boolean) => void,
) {
  const toggle = button(`settings-toggle${value ? ' on' : ''}`)
  toggle.type = 'button'
  toggle.setAttribute('role', 'switch')
  toggle.setAttribute('aria-checked', String(value))
  toggle.setAttribute('aria-label', label)
  toggle.append(el('span', 'settings-toggle-knob'))
  toggle.addEventListener('click', () => onChange(!value))
  return detailControlRow(label, meta, toggle)
}

function hueSlider(
  value: number,
  swatchColor: string,
  onChange: (value: number) => void,
) {
  const wrap = el('div', 'appearance-hue')
  const input = el('input', 'appearance-slider appearance-hue-slider') as HTMLInputElement
  input.type = 'range'
  input.min = '0'
  input.max = '360'
  input.value = String(value)
  input.setAttribute('aria-label', 'Accent hue')
  const swatch = el('span', 'appearance-swatch')
  swatch.style.background = swatchColor
  input.addEventListener('input', () => onChange(Number(input.value)))
  wrap.append(input, swatch)
  return wrap
}

function intensityControl(value: number, onChange: (value: number) => void) {
  const wrap = el('div', 'appearance-intensity')
  const input = el('input', 'appearance-slider') as HTMLInputElement
  input.type = 'range'
  input.min = '0'
  input.max = '100'
  input.value = String(value)
  input.setAttribute('aria-label', 'Accent intensity')
  const label = el('span', 'appearance-intensity-value', [`${value}%`])
  input.addEventListener('input', () => onChange(Number(input.value)))
  wrap.append(input, label)
  return wrap
}

function stepperControl(
  value: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
) {
  const wrap = el('div', 'appearance-stepper')
  const minus = button('appearance-stepper-btn', '−')
  minus.type = 'button'
  minus.setAttribute('aria-label', 'Decrease')
  minus.disabled = value <= min
  const valueEl = el('span', 'appearance-stepper-value', [String(value)])
  const plus = button('appearance-stepper-btn', '+')
  plus.type = 'button'
  plus.setAttribute('aria-label', 'Increase')
  plus.disabled = value >= max
  minus.addEventListener('click', () => onChange(Math.max(min, value - 1)))
  plus.addEventListener('click', () => onChange(Math.min(max, value + 1)))
  wrap.append(minus, valueEl, plus)
  return wrap
}

function customRow(label: string, control: HTMLElement) {
  const row = ListRow()
  row.append(el('span', 'settings-row-label', [label]), control)
  return row
}
