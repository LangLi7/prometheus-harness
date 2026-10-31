/**
 * LaTeX math → Typst math.
 *
 * A chat answer writes formulas in LaTeX because that is what models produce.
 * Typst has its own math syntax, close enough for the everyday set — fractions,
 * roots, Greek letters, comparisons, sums — but not identical. This translator
 * covers that set and **fails closed**: an unknown command returns `null`, and
 * the caller prints the original formula as code instead of emitting broken Typst.
 *
 * @module @prometheus-harness/pdf-export/math
 */

const COMMANDS: Readonly<Record<string, string>> = {
  cdot: 'dot',
  times: 'times',
  div: 'div',
  pm: 'plus.minus',
  mp: 'minus.plus',
  le: '<=',
  leq: '<=',
  ge: '>=',
  geq: '>=',
  neq: '!=',
  ne: '!=',
  approx: 'approx',
  equiv: 'equiv',
  sim: 'tilde.op',
  propto: 'prop',
  to: 'arrow.r',
  rightarrow: 'arrow.r',
  leftarrow: 'arrow.l',
  leftrightarrow: 'arrow.l.r',
  Rightarrow: 'arrow.r.double',
  Leftarrow: 'arrow.l.double',
  infty: 'infinity',
  sum: 'sum',
  prod: 'product',
  int: 'integral',
  iint: 'integral.double',
  oint: 'integral.cont',
  partial: 'diff',
  nabla: 'nabla',
  in: 'in',
  notin: 'in.not',
  subset: 'subset',
  supset: 'supset',
  cup: 'union',
  cap: 'sect',
  emptyset: 'emptyset',
  forall: 'forall',
  exists: 'exists',
  land: 'and',
  lor: 'or',
  neg: 'not',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  cot: 'cot',
  arcsin: 'arcsin',
  arccos: 'arccos',
  arctan: 'arctan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  log: 'log',
  ln: 'ln',
  exp: 'exp',
  lim: 'lim',
  max: 'max',
  min: 'min',
  sup: 'sup',
  inf: 'inf',
  mod: 'mod',
  gcd: 'gcd',
  lcm: 'lcm',
  degree: 'degree',
  circ: 'circle.stroked.small',
  ldots: 'dots',
  cdots: 'dots.c',
  dots: 'dots',
  quad: 'quad',
  qquad: 'wide',
}

const GREEK = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon',
  'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Upsilon', 'Phi', 'Psi', 'Omega',
] as const

/** Raised as soon as a construct has no faithful Typst equivalent. */
class Unsupported extends Error {}

/**
 * Read one balanced `{…}` group starting at `start`, which must point at `{`.
 *
 * @param source - math source.
 * @param start - index of the opening brace.
 * @returns the group content and the index after the closing brace.
 */
function readGroup(source: string, start: number): { readonly content: string; readonly next: number } {
  if (source[start] !== '{') throw new Unsupported('group')
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return { content: source.slice(start + 1, index), next: index + 1 }
    }
  }
  throw new Unsupported('unbalanced group')
}

/** Escape a literal string for a Typst math text atom. */
function literal(text: string): string {
  return `"${text.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, ' ')}"`
}

function convert(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    const character = source[index]
    if (character === '\\') {
      const match = /^\\([A-Za-z]+|.)/u.exec(source.slice(index))
      if (match === null) throw new Unsupported('backslash')
      const name = match[1] ?? ''
      index += match[0].length

      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const numerator = readGroup(source, index)
        const denominator = readGroup(source, numerator.next)
        out += `frac(${convert(numerator.content)}, ${convert(denominator.content)})`
        index = denominator.next
        continue
      }
      if (name === 'sqrt') {
        if (source[index] === '[') {
          const close = source.indexOf(']', index)
          if (close < 0) throw new Unsupported('sqrt index')
          const degree = source.slice(index + 1, close)
          const group = readGroup(source, close + 1)
          out += `root(${convert(degree)}, ${convert(group.content)})`
          index = group.next
          continue
        }
        const group = readGroup(source, index)
        out += `sqrt(${convert(group.content)})`
        index = group.next
        continue
      }
      if (name === 'text' || name === 'mathrm' || name === 'textrm') {
        const group = readGroup(source, index)
        out += literal(group.content)
        index = group.next
        continue
      }
      if (name === 'mathbf' || name === 'mathit' || name === 'mathsf' || name === 'mathtt') {
        const group = readGroup(source, index)
        const wrapper = name === 'mathbf' ? 'bold' : name === 'mathit' ? 'italic' : 'upright'
        out += `${wrapper}(${convert(group.content)})`
        index = group.next
        continue
      }
      if (name === 'operatorname') {
        const group = readGroup(source, index)
        out += `op(${literal(group.content)})`
        index = group.next
        continue
      }
      if (name === 'left' || name === 'right') continue
      if (name === ',' || name === ';' || name === ':' || name === '!' || name === ' ') continue
      if (GREEK.includes(name as (typeof GREEK)[number])) {
        out += name
        continue
      }
      const mapped = COMMANDS[name]
      if (mapped !== undefined) {
        out += mapped
        continue
      }
      throw new Unsupported(`\\${name}`)
    }

    if (character === '{') {
      const group = readGroup(source, index)
      out += `(${convert(group.content)})`
      index = group.next
      continue
    }
    if (character === '}' || character === '&' || character === '\n') throw new Unsupported('alignment')
    if (character === '~') {
      out += 'space'
      index += 1
      continue
    }
    out += character
    index += 1
  }
  return out
}

/**
 * Translate one LaTeX formula.
 *
 * @param latex - formula body without the surrounding dollars.
 * @returns Typst math body, or `null` when the formula uses an unsupported construct.
 */
export function latexToTypst(latex: string): string | null {
  const trimmed = latex.trim()
  if (trimmed === '') return null
  try {
    return convert(trimmed).trim()
  } catch {
    return null
  }
}
