import assert from 'node:assert/strict'
import test from 'node:test'

import {auditRouting, parseRoutingMarker} from '../skills/auto-pilot/scripts/history-routing.mjs'

const implementationDefaults = {
  substantive_executor: 'auto', model: 'gpt-5.6-sol', thinking: 'xhigh',
}
const releaseDefaults = {model: 'gpt-5.6-sol', thinking: 'xhigh'}

function manifest({mode = 'pr', continuation = null, implementation = implementationDefaults, release = releaseDefaults, collaboration = 'auto'} = {}) {
  return {
    mode,
    continuation,
    routing_config: {
      implementation,
      release,
      collaboration: {policy: collaboration},
    },
  }
}

function marker(implementation, continuation) {
  return `<!-- auto-pilot-routing: ${JSON.stringify({implementation, continuation})} -->`
}

function independentTask(taskRef = 'implementation-task') {
  return {
    lane: 'independent_task', task_ref: taskRef, worktree: true,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null,
  }
}

function notRequested() {
  return {lane: 'not_requested', task_ref: null, worktree: null, model: null, thinking: null, reason: null}
}

test('routing audit passes matching owner-stage evidence and marks unobservable depth honestly', () => {
  const taskRef = 'implementation-task'
  const message = `::created-thread{threadId="${taskRef}"}\n${marker(independentTask(taskRef), notRequested())}`
  const result = auditRouting({message, manifest: manifest(), subagents: 1})
  assert.equal(result.status, 'passed')
  assert.deepEqual(result.created_thread_refs, [taskRef])
  assert.deepEqual(result.deviations, [])
  assert.match(result.unverified.join('\n'), /parent-child delegation depth/)

  const additionalStage = auditRouting({
    message: `::created-thread{threadId="${taskRef}"}\n::created-thread{threadId="unexpected-task"}\n${marker(independentTask(taskRef), notRequested())}`,
    manifest: manifest(),
  })
  assert.equal(additionalStage.status, 'passed')
  assert.match(additionalStage.unverified.join('\n'), /additional owner-stage relationships/)

  const undeclaredTask = auditRouting({
    message: `::created-thread{threadId="unexpected-task"}\n${marker({
      lane: 'direct', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh',
      reason: 'Owner completed directly.',
    }, notRequested())}`,
    manifest: manifest(),
  })
  assert.equal(undeclaredTask.status, 'deviation')
  assert.match(undeclaredTask.deviations.join('\n'), /not accounted for/)
})

test('routing audit keeps a disclosed direct task-interface fallback separate from a deviation', () => {
  const implementation = {
    lane: 'direct', task_ref: null, worktree: null, model: null, thinking: null,
    reason: 'Independent task interface unavailable; controller fallback.',
  }
  const result = auditRouting({message: marker(implementation, notRequested()), manifest: manifest()})
  assert.equal(result.status, 'fallback')
  assert.deepEqual(result.deviations, [])
})

test('routing audit honors owner-decided primary stages and rejects explicit conflicts', () => {
  const primarySubagent = {
    lane: 'collaboration_subagent', task_ref: null, worktree: true,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'Configured primary subagent.',
  }
  const unauthorized = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: manifest({implementation: {...implementationDefaults, substantive_executor: 'task'}}),
    subagents: 1,
  })
  assert.equal(unauthorized.status, 'deviation')
  assert.match(unauthorized.deviations.join('\n'), /not explicitly configured/)

  const configured = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: manifest({implementation: {...implementationDefaults, substantive_executor: 'subagent'}}),
    subagents: 1,
  })
  assert.equal(configured.status, 'passed')

  const explicitlyAutomatic = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: manifest({implementation: {...implementationDefaults, substantive_executor: 'auto'}}),
    subagents: 1,
  })
  assert.equal(explicitlyAutomatic.status, 'passed')

  const helpersOff = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n${marker(independentTask(), notRequested())}`,
    manifest: manifest({collaboration: 'off'}), subagents: 1,
  })
  assert.equal(helpersOff.status, 'deviation')
  assert.match(helpersOff.deviations.join('\n'), /collaboration.policy=off/)
})

test('release routing audits fresh, fallback, and current release task lanes', () => {
  const releaseTask = {
    lane: 'fresh_release_task', task_ref: 'release-task', worktree: true,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null,
  }
  const fresh = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n::created-thread{threadId="release-task"}\n${marker(independentTask(), releaseTask)}`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(fresh.status, 'passed')

  const modelFallback = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n::created-thread{threadId="release-task"}\n${marker(independentTask(), {
      ...releaseTask, model: 'runtime-fallback-model', reason: 'Configured release model unavailable.',
    })}`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(modelFallback.status, 'fallback')

  const duplicatedTask = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n${marker(independentTask(), {
      ...releaseTask, task_ref: 'implementation-task',
    })}`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(duplicatedTask.status, 'deviation')
  assert.match(duplicatedTask.deviations.join('\n'), /distinct task_ref/)

  const extraReleaseTask = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n::created-thread{threadId="release-task"}\n::created-thread{threadId="second-release-task"}\n${marker(independentTask(), releaseTask)}`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(extraReleaseTask.status, 'passed')
  assert.match(extraReleaseTask.unverified.join('\n'), /second-release-task/)

  const fallback = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n${marker(independentTask(), {
      lane: 'fallback_command', task_ref: null, worktree: null, model: null, thinking: null,
      reason: 'Fresh task interface unavailable.',
    })}\n$auto-pilot release https://github.com/owner/repo/pull/1`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(fallback.status, 'fallback')

  const malformedFallback = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n${marker(independentTask(), {
      lane: 'fallback_command', task_ref: null, worktree: null, model: null, thinking: null,
      reason: 'Fresh task interface unavailable.',
    })}\n$auto-pilot release not-a-pr`,
    manifest: manifest({continuation: 'release'}),
  })
  assert.equal(malformedFallback.status, 'deviation')

  const current = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_release_task', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null},
    ),
    manifest: manifest({mode: 'release'}),
  })
  assert.equal(current.status, 'passed')

  const undisclosedModelFallback = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_release_task', task_ref: null, worktree: null, model: 'other-model', thinking: 'xhigh', reason: null},
    ),
    manifest: manifest({mode: 'release'}),
  })
  assert.equal(undisclosedModelFallback.status, 'deviation')
  assert.match(undisclosedModelFallback.deviations.join('\n'), /release model differs/)
})

test('missing or malformed markers remain operational unknown or deviation, never receipt evidence', () => {
  assert.equal(auditRouting({message: 'Completed.', manifest: manifest()}).status, 'unknown')
  assert.equal(auditRouting({message: '<!-- auto-pilot-routing: {not json} -->', manifest: manifest()}).status, 'deviation')
  const duplicate = `${marker(independentTask(), notRequested())}\n${marker(independentTask(), notRequested())}`
  assert.equal(auditRouting({message: duplicate, manifest: manifest()}).status, 'deviation')
  assert.equal(parseRoutingMarker(duplicate).status, 'invalid')
  assert.equal(parseRoutingMarker('Completed.').status, 'missing')
  const invalidGoal = `<!-- auto-pilot-routing: ${JSON.stringify({
    goal_id: 'human-readable-project-name', implementation: independentTask(), continuation: notRequested(),
  })} -->`
  assert.match(auditRouting({message: invalidGoal, manifest: manifest()}).deviations.join('\n'), /opaque apg_/)
})
