#!/usr/bin/env node
/**
 * Compare two locale dictionaries: identical key structure and identical
 * `{placeholder}` sets. A missing placeholder breaks rendering silently, which
 * is exactly the kind of defect this catches before a user sees it.
 *
 * Usage: node check-locale.mjs <locales-dir> <reference> <target>
 * Example: node check-locale.mjs ../../.tmp/mirofish/locales en de
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , dir, referenceName = 'en', targetName = 'de'] = process.argv
if (!dir) {
  console.error('usage: node check-locale.mjs <locales-dir> [reference] [target]')
  process.exit(2)
}

const read = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'))
const reference = read(referenceName)
const target = read(targetName)
const problems = []

const placeholdersOf = (value) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')

function walk(ref, tgt, path) {
  if (Array.isArray(ref)) {
    if (!Array.isArray(tgt) || tgt.length !== ref.length) {
      problems.push(`${path}: array length differs`)
      return
    }
    ref.forEach((value, index) => walk(value, tgt[index], `${path}[${index}]`))
    return
  }

  if (ref && typeof ref === 'object') {
    const refKeys = Object.keys(ref)
    const tgtKeys = tgt && typeof tgt === 'object' ? Object.keys(tgt) : []
    for (const key of refKeys) if (!tgtKeys.includes(key)) problems.push(`${path}.${key}: missing in ${targetName}`)
    for (const key of tgtKeys) if (!refKeys.includes(key)) problems.push(`${path}.${key}: extra in ${targetName}`)
    for (const key of refKeys) if (tgtKeys.includes(key)) walk(ref[key], tgt[key], `${path}.${key}`)
    return
  }

  if (typeof ref !== 'string' || typeof tgt !== 'string') {
    problems.push(`${path}: type mismatch (${typeof ref} vs ${typeof tgt})`)
    return
  }
  if (placeholdersOf(ref) !== placeholdersOf(tgt)) {
    problems.push(`${path}: placeholders "${placeholdersOf(tgt)}" != "${placeholdersOf(ref)}"`)
  }
  if (tgt.trim() === '') problems.push(`${path}: empty translation`)
}

walk(reference, target, '$')

const countLeaves = (node) =>
  Object.values(node).reduce((sum, value) => sum + (value && typeof value === 'object' ? countLeaves(value) : 1), 0)

console.log(`keys: ${referenceName}=${countLeaves(reference)} ${targetName}=${countLeaves(target)}`)
console.log(problems.length === 0 ? 'OK: identical structure and placeholders' : `PROBLEMS (${problems.length}):\n${problems.join('\n')}`)
process.exit(problems.length === 0 ? 0 : 1)
