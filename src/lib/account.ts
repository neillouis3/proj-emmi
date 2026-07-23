import type { AccountProfile } from '@/types/domain'

export function accountDisplayName(account: AccountProfile) {
  return (
    `${account.firstName} ${account.lastName}`.trim() ||
    account.handle ||
    'Account'
  )
}

export function accountInitials(account: AccountProfile) {
  const name = accountDisplayName(account)
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
