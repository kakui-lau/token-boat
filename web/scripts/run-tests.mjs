import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourceRoot = path.join(projectRoot, 'src')
const testPattern = /\.test\.(?:ts|tsx)$/

function collectTests(directory) {
  const tests = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      tests.push(...collectTests(absolutePath))
      continue
    }
    if (testPattern.test(entry.name)) {
      tests.push(path.relative(projectRoot, absolutePath))
    }
  }
  return tests
}

const nodeTests = []
const vitestTests = []
const unknownTests = []

for (const testFile of collectTests(sourceRoot).sort()) {
  const source = readFileSync(path.join(projectRoot, testFile), 'utf8')
  if (/from ['"]node:test['"]/.test(source)) {
    nodeTests.push(testFile)
  } else if (/from ['"]vitest['"]/.test(source)) {
    vitestTests.push(testFile)
  } else {
    unknownTests.push(testFile)
  }
}

if (unknownTests.length > 0) {
  console.error(
    `Tests without a recognized runner:\n${unknownTests.join('\n')}`
  )
  process.exit(1)
}

const suites = [
  { command: 'bun', args: ['test', ...nodeTests], label: 'node:test' },
  {
    command: 'bunx',
    args: ['vitest', 'run', ...vitestTests],
    label: 'Vitest',
  },
]

for (const suite of suites) {
  if (suite.args.length <= 1) {
    continue
  }
  console.log(`\nRunning ${suite.label} suite...`)
  const result = spawnSync(suite.command, suite.args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
