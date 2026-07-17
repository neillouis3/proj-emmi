import { el } from '@/lib/dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader'
import { mountRouter } from '@/app/router'
import { BlockingModalHost } from '@/components/blocking/BlockingModal'
import { PromoteSheetHost } from '@/components/blocking/PromoteSheet'

export function Shell() {
  const shell = el('div', 'app-shell')
  const workspace = el('main', 'workspace product-workspace')
  const top = el('div', 'workspace-top')
  top.append(WorkspaceHeader())
  const outlet = el('div', 'screen-outlet no-drag')

  workspace.append(top, outlet, PromoteSheetHost())
  shell.append(Sidebar(), workspace, BlockingModalHost())
  mountRouter(outlet)
  return shell
}
