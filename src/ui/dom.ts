// Tiny DOM builder to keep view code declarative and readable.

type Child = Node | string | null | undefined | false;

interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
  style?: Partial<CSSStyleDeclaration>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  if (props.style) Object.assign(node.style, props.style);
  if (props.on)
    for (const [event, handler] of Object.entries(props.on)) {
      node.addEventListener(event, handler as EventListener);
    }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Replace the entire content of a host element with new children. */
export function mount(host: HTMLElement, ...children: Child[]): void {
  clear(host);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    host.append(child);
  }
}
