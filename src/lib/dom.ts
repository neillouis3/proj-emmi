export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (children) {
    for (const child of children) {
      node.append(typeof child === 'string' ? document.createTextNode(child) : child)
    }
  }
  return node
}

export function button(className: string, label?: string) {
  const node = el('button', className)
  node.type = 'button'
  if (label) node.textContent = label
  return node
}
