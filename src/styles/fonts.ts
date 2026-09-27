// Single source of truth for font stacks. No component should hardcode
// a font-family string — import from here instead.

export const fonts = {
  base: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
} as const;
