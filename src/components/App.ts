import { Shell } from '@/components/layout/Shell'

export function App(root: HTMLElement) {
  root.replaceChildren(Shell())
}
