import { el, button } from '@/lib/dom'
import { ListRow, SectionBlock } from '@/components/shared/SectionBlock'
import { SelectField } from '@/components/shared/FilterBar'
import { icons } from '@/lib/icons'
import { accountDisplayName, accountInitials } from '@/lib/account'
import {
  getState,
  navigate,
  setAccountProfile,
} from '@/app/store'
import type { AccountProfile } from '@/types/domain'

export function Account() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body settings-page account-page')

  const render = () => {
    const state = getState()
    const account = state.account
    const name = accountDisplayName(account)
    page.replaceChildren()
    body.replaceChildren()

    const hero = el('section', 'account-hero')
    hero.append(avatarNode(account, 'account-avatar'), (() => {
      const copy = el('div', 'account-hero-copy')
      copy.append(
        el('div', 'account-hero-name', [name]),
        el('div', 'account-hero-meta', [`@${account.handle} · ${account.email}`]),
      )
      return copy
    })(), el('span', `account-license-badge license-${account.license}`, [
      account.licenseLabel,
    ]))
    body.append(hero)

    body.append(
      SectionBlock({
        icon: icons.user,
        tone: 'pink',
        title: 'Profile',
        rows: [
          staticValueRow('Email', account.email),
          profileImageRow(account, render),
          fieldRow('First Name', account.firstName, (v) => {
            setAccountProfile({ firstName: v })
            render()
          }),
          fieldRow('Last Name', account.lastName, (v) => {
            setAccountProfile({ lastName: v })
            render()
          }),
        ],
      }),
    )

    const licenseControl = SelectField({
      label: 'License',
      value: account.license,
      options: [
        { value: 'personal', label: 'Personal' },
        { value: 'pro', label: 'Pro' },
        { value: 'team', label: 'Team' },
      ],
      onChange: (v) => {
        const license = v as AccountProfile['license']
        setAccountProfile({
          license,
          licenseLabel:
            license === 'personal' ? 'Personal' : license === 'pro' ? 'Pro' : 'Team',
        })
        render()
      },
    })
    licenseControl.classList.add('settings-select')

    body.append(
      SectionBlock({
        icon: icons.checkBadge,
        tone: 'green',
        title: 'License',
        rows: [
          customRow('Plan', licenseControl),
          valueRow(
            'Status',
            account.license === 'personal' ? 'Free forever' : 'Active',
          ),
          valueRow('Seats', account.license === 'team' ? '5 seats' : '1 seat'),
          linkRow('Manage billing', 'Opens billing portal', () => {}),
        ],
      }),
    )

    body.append(
      SectionBlock({
        icon: icons.more,
        tone: 'gray',
        title: 'More',
        rows: [
          linkRow('Keyboard shortcuts', 'Manage keybinds', () =>
            navigate('keybinds'),
          ),
          linkRow('Settings', 'App preferences', () => navigate('settings')),
          linkRow('Sign out', 'End this local session', () => {}),
        ],
      }),
    )

    page.append(body)
  }

  render()
  return page
}

function avatarNode(account: AccountProfile, className: string) {
  const avatar = el('div', className)
  if (account.avatarDataUrl) {
    avatar.style.backgroundImage = `url(${account.avatarDataUrl})`
    avatar.style.backgroundSize = 'cover'
    avatar.style.backgroundPosition = 'center'
    avatar.textContent = ''
  } else {
    avatar.textContent = accountInitials(account)
  }
  return avatar
}

function profileImageRow(
  account: AccountProfile,
  refresh: () => void,
) {
  const row = ListRow({ className: 'account-profile-image-row' })
  const left = el('div', 'settings-row-copy')
  left.append(el('span', 'settings-row-label', ['Profile Image']))

  const right = el('div', 'account-image-actions')
  const thumb = avatarNode(account, 'account-avatar-sm')

  const file = el('input', 'sr-only') as HTMLInputElement
  file.type = 'file'
  file.accept = 'image/*'
  file.addEventListener('change', () => {
    const picked = file.files?.[0]
    if (!picked) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAccountProfile({ avatarDataUrl: reader.result })
        refresh()
      }
    }
    reader.readAsDataURL(picked)
  })

  const upload = button('btn btn-ghost btn-compact', 'Upload image')
  upload.type = 'button'
  upload.addEventListener('click', () => file.click())

  const remove = button('btn btn-ghost btn-compact', 'Remove')
  remove.type = 'button'
  remove.disabled = !account.avatarDataUrl
  remove.addEventListener('click', () => {
    setAccountProfile({ avatarDataUrl: null })
    refresh()
  })

  right.append(thumb, upload, remove, file)
  row.append(left, right)
  return row
}

function staticValueRow(label: string, value: string) {
  const row = ListRow()
  row.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'account-static-value', [value]),
  )
  return row
}

function fieldRow(label: string, value: string, onChange: (value: string) => void) {
  const row = ListRow({ className: 'account-field-row' })
  row.append(el('span', 'settings-row-label', [label]))
  const input = el('input', 'account-field-input') as HTMLInputElement
  input.type = 'text'
  input.value = value
  input.addEventListener('change', () => onChange(input.value.trim()))
  row.append(input)
  return row
}

function valueRow(label: string, value: string) {
  const row = ListRow()
  row.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'account-static-value', [value]),
  )
  return row
}

function customRow(label: string, control: HTMLElement) {
  const row = ListRow()
  row.append(el('span', 'settings-row-label', [label]), control)
  return row
}

function linkRow(label: string, meta: string, onClick: () => void) {
  const row = button('settings-row settings-row-button')
  row.type = 'button'
  const left = el('div', 'settings-row-copy')
  left.append(
    el('span', 'settings-row-label', [label]),
    el('span', 'settings-row-meta', [meta]),
  )
  const chevron = el('span', 'settings-row-chevron')
  chevron.innerHTML = icons.chevronRight
  row.append(left, chevron)
  row.addEventListener('click', onClick)
  return row
}
