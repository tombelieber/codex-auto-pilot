import assert from 'node:assert/strict'
import test from 'node:test'

import {auditRouting, parseRoutingMarker} from '../skills/auto-pilot/scripts/history-routing.mjs'

const implementationDefaults = {
  substantive_executor: 'auto', model: 'gpt-5.6-sol', thinking: 'xhigh',
}
const releaseDefaults = {model: 'gpt-5.6-sol', thinking: 'xhigh'}

function legacyManifest({mode = 'pr', continuation = null, implementation = implementationDefaults, release = releaseDefaults, collaboration = 'auto'} = {}) {
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

function currentManifest(goalMode = 'pr', invokedAlias = null) {
  return {
    schema_version: 6,
    invocation_schema_version: 6,
    goal_mode: goalMode,
    input_kind: invokedAlias ? 'existing_candidate' : 'plan_or_goal',
    mode: goalMode,
    invoked_alias: invokedAlias,
    continuation: null,
    routing_config: {
      implementation: implementationDefaults,
      release: releaseDefaults,
      collaboration: {policy: 'auto'},
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

test('legacy schema routing audit passes matching owner-stage evidence and marks unobservable depth honestly', () => {
  const taskRef = 'implementation-task'
  const message = `::created-thread{threadId="${taskRef}"}\n${marker(independentTask(taskRef), notRequested())}`
  const result = auditRouting({message, manifest: legacyManifest(), subagents: 1})
  assert.equal(result.status, 'passed')
  assert.deepEqual(result.created_thread_refs, [taskRef])
  assert.deepEqual(result.deviations, [])
  assert.match(result.unverified.join('\n'), /parent-child delegation depth/)

  const additionalStage = auditRouting({
    message: `::created-thread{threadId="${taskRef}"}\n::created-thread{threadId="unexpected-task"}\n${marker(independentTask(taskRef), notRequested())}`,
    manifest: legacyManifest(),
  })
  assert.equal(additionalStage.status, 'passed')
  assert.match(additionalStage.unverified.join('\n'), /additional owner-stage relationships/)

  const undeclaredTask = auditRouting({
    message: `::created-thread{threadId="unexpected-task"}\n${marker({
      lane: 'direct', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh',
      reason: 'Owner completed directly.',
    }, notRequested())}`,
    manifest: legacyManifest(),
  })
  assert.equal(undeclaredTask.status, 'deviation')
  assert.match(undeclaredTask.deviations.join('\n'), /not accounted for/)
})

test('legacy schema routing keeps a disclosed direct task-interface fallback separate from a deviation', () => {
  const implementation = {
    lane: 'direct', task_ref: null, worktree: null, model: null, thinking: null,
    reason: 'Independent task interface unavailable; controller fallback.',
  }
  const result = auditRouting({message: marker(implementation, notRequested()), manifest: legacyManifest()})
  assert.equal(result.status, 'fallback')
  assert.deepEqual(result.deviations, [])
})

test('legacy schema routing honors owner-decided primary stages and rejects explicit conflicts', () => {
  const primarySubagent = {
    lane: 'collaboration_subagent', task_ref: null, worktree: true,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'Configured primary subagent.',
  }
  const unauthorized = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: legacyManifest({implementation: {...implementationDefaults, substantive_executor: 'task'}}),
    subagents: 1,
  })
  assert.equal(unauthorized.status, 'deviation')
  assert.match(unauthorized.deviations.join('\n'), /not explicitly configured/)

  const configured = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: legacyManifest({implementation: {...implementationDefaults, substantive_executor: 'subagent'}}),
    subagents: 1,
  })
  assert.equal(configured.status, 'passed')

  const explicitlyAutomatic = auditRouting({
    message: marker(primarySubagent, notRequested()),
    manifest: legacyManifest({implementation: {...implementationDefaults, substantive_executor: 'auto'}}),
    subagents: 1,
  })
  assert.equal(explicitlyAutomatic.status, 'passed')

  const helpersOff = auditRouting({
    message: `::created-thread{threadId="implementation-task"}\n${marker(independentTask(), notRequested())}`,
    manifest: legacyManifest({collaboration: 'off'}), subagents: 1,
  })
  assert.equal(helpersOff.status, 'deviation')
  assert.match(helpersOff.deviations.join('\n'), /collaboration.policy=off/)
})

test('legacy schema routing keeps ship and release authority in their current task', () => {
  const currentShip = auditRouting({
    message: marker({
      lane: 'direct', task_ref: null, worktree: null,
      model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'The ship owner implemented in the current task.',
    }, {
      lane: 'current_ship_task', task_ref: null, worktree: null,
      model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'The ship owner continued through production.',
    }),
    manifest: legacyManifest({continuation: 'release'}),
  })
  assert.equal(currentShip.status, 'passed')

  const freshTask = auditRouting({
    message: `::created-thread{threadId="release-task"}\n${marker({
      lane: 'direct', task_ref: null, worktree: null,
      model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'The ship owner implemented in the current task.',
    }, {
      lane: 'fresh_release_task', task_ref: 'release-task', worktree: true,
      model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null,
    })}`,
    manifest: legacyManifest({continuation: 'release'}),
  })
  assert.equal(freshTask.status, 'deviation')
  assert.match(freshTask.deviations.join('\n'), /ship release continuation must remain in the same task/)

  const currentShipModel = auditRouting({
    message: marker({
      lane: 'direct', task_ref: null, worktree: null,
      model: 'gpt-5.6-terra', thinking: 'high', reason: 'The current ship owner implemented directly.',
    }, {
      lane: 'current_ship_task', task_ref: null, worktree: null,
      model: 'gpt-5.6-terra', thinking: 'high', reason: 'The current task continued through production.',
    }),
    manifest: legacyManifest({continuation: 'release'}),
  })
  assert.equal(currentShipModel.status, 'passed')

  const current = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_release_task', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh', reason: null},
    ),
    manifest: legacyManifest({mode: 'release'}),
  })
  assert.equal(current.status, 'passed')

  const undisclosedModelFallback = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_release_task', task_ref: null, worktree: null, model: 'other-model', thinking: 'xhigh', reason: null},
    ),
    manifest: legacyManifest({mode: 'release'}),
  })
  assert.equal(undisclosedModelFallback.status, 'deviation')
  assert.match(undisclosedModelFallback.deviations.join('\n'), /release model differs/)
})

test('legacy schema missing or malformed markers remain operational unknown or deviation, never receipt evidence', () => {
  assert.equal(auditRouting({message: 'Completed.', manifest: legacyManifest()}).status, 'unknown')
  assert.equal(auditRouting({message: '<!-- auto-pilot-routing: {not json} -->', manifest: legacyManifest()}).status, 'deviation')
  const duplicate = `${marker(independentTask(), notRequested())}\n${marker(independentTask(), notRequested())}`
  assert.equal(auditRouting({message: duplicate, manifest: legacyManifest()}).status, 'deviation')
  assert.equal(parseRoutingMarker(duplicate).status, 'invalid')
  assert.equal(parseRoutingMarker('Completed.').status, 'missing')
  const invalidGoal = `<!-- auto-pilot-routing: ${JSON.stringify({
    goal_id: 'human-readable-project-name', implementation: independentTask(), continuation: notRequested(),
  })} -->`
  assert.match(auditRouting({message: invalidGoal, manifest: legacyManifest()}).deviations.join('\n'), /opaque apg_/)
})

test('current routing schema keeps both goal modes and ship aliases in the invoking task', () => {
  const direct = {
    lane: 'direct', task_ref: null, worktree: null,
    model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'The invoking owner completed the work.',
  }
  const pr = auditRouting({message: marker(direct, notRequested()), manifest: currentManifest('pr')})
  assert.equal(pr.schema_version, 4)
  assert.equal(pr.status, 'passed')

  const ship = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_ship_task', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'Same task owns production.'},
    ),
    manifest: currentManifest('ship', 'deploy'),
  })
  assert.equal(ship.status, 'passed')

  const shipPlanWithoutImplementation = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_ship_task', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'Same task owns production.'},
    ),
    manifest: currentManifest('ship'),
  })
  assert.equal(shipPlanWithoutImplementation.status, 'deviation')
  assert.match(shipPlanWithoutImplementation.deviations.join('\n'), /ship plan goal requires a real implementation lane/)

  const aliasWithForbiddenHelpers = auditRouting({
    message: marker(
      {lane: 'not_applicable', task_ref: null, worktree: null, model: null, thinking: null, reason: null},
      {lane: 'current_ship_task', task_ref: null, worktree: null, model: 'gpt-5.6-sol', thinking: 'xhigh', reason: 'Same task owns production.'},
    ),
    manifest: {...currentManifest('ship', 'release'), routing_config: {
      implementation: implementationDefaults, release: releaseDefaults, collaboration: {policy: 'off'},
    }},
    subagents: 1,
  })
  assert.equal(aliasWithForbiddenHelpers.status, 'deviation')
  assert.match(aliasWithForbiddenHelpers.deviations.join('\n'), /collaboration.policy=off/)

  const legacyLane = auditRouting({
    message: marker(direct, {lane: 'current_release_task', task_ref: null, worktree: null, model: null, thinking: null, reason: null}),
    manifest: currentManifest('ship', 'release'),
  })
  assert.equal(legacyLane.status, 'deviation')
  assert.match(legacyLane.deviations.join('\n'), /current_ship_task/)

  const ownerTransfer = auditRouting({
    message: `::created-thread{threadId="new-owner"}\n${marker(independentTask('new-owner'), notRequested())}`,
    manifest: currentManifest('pr'),
    subagents: 1,
  })
  assert.equal(ownerTransfer.status, 'deviation')
  assert.match(ownerTransfer.deviations.join('\n'), /invoking task must remain/)
})

test('inherited model preferences accept the actual owner-selected helper model and effort', () => {
  const inherited = {
    ...currentManifest('pr'),
    routing_config: {
      implementation: {substantive_executor: 'auto', model: 'inherit', thinking: 'inherit'},
      release: {model: 'inherit', thinking: 'inherit'},
      collaboration: {policy: 'auto', model: 'inherit', thinking: 'inherit'},
    },
  }
  const result = auditRouting({
    message: marker({
      lane: 'collaboration_subagent', task_ref: null, worktree: true,
      model: 'gpt-5.6-luna', thinking: 'xhigh', reason: 'The owner selected a bounded implementation helper.',
    }, notRequested()),
    manifest: inherited,
    subagents: 1,
  })
  assert.equal(result.status, 'passed')
  assert.deepEqual(result.deviations, [])
})
