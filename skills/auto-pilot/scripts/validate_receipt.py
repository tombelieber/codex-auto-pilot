#!/usr/bin/env python3
"""Validate an Auto Pilot version 2 terminal receipt without dependencies."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


EFFORTS = {"low", "medium", "high", "xhigh", "ultra"}
REVIEWER_EFFORTS = {"high", "xhigh", "ultra"}
COMMANDER_MODEL = "gpt-5.6-sol"
IMPLEMENTER_MODEL = "gpt-5.6-terra"


def die(message):
    print(f"invalid receipt: {message}", file=sys.stderr)
    raise SystemExit(1)


def obj(value, name):
    if not isinstance(value, dict):
        die(f"{name} must be an object")
    return value


def text(value, name):
    if not isinstance(value, str) or not value.strip():
        die(f"{name} must be a non-empty string")
    return value.strip()


def nonnegative_int(value, name):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        die(f"{name} must be a non-negative integer")
    return value


def git_sha(value, name):
    value = text(value, name)
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", value):
        die(f"{name} must be a 7-64 character hexadecimal Git id")
    return value


def web_url(value, name):
    value = text(value, name)
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        die(f"{name} must be an http/https URL with a host")
    return value


def validate_effort(effort):
    effort = obj(effort, "effort")
    requested = effort.get("requested")
    if requested not in EFFORTS | {"auto"}:
        die("effort.requested must be auto, low, medium, high, xhigh, or ultra")
    if effort.get("resolved") not in EFFORTS:
        die("effort.resolved must be low, medium, high, xhigh, or ultra")
    text(effort.get("rationale"), "effort.rationale")
    return effort["resolved"]


def validate_orchestration(orchestration, require_complete, resolved_effort):
    orchestration = obj(orchestration, "orchestration")
    if orchestration.get("strategy") != "dynamic_ready_frontier":
        die("orchestration.strategy must be dynamic_ready_frontier")
    commander = obj(orchestration.get("commander"), "orchestration.commander")
    commander_id = text(commander.get("id"), "orchestration.commander.id")
    if commander.get("model") != COMMANDER_MODEL:
        die(f"orchestration.commander.model must be {COMMANDER_MODEL}")
    if commander.get("reasoning_effort") not in EFFORTS:
        die("orchestration.commander.reasoning_effort must be low, medium, high, xhigh, or ultra")
    if commander.get("reasoning_effort") != resolved_effort:
        die("orchestration.commander.reasoning_effort must match effort.resolved")
    if orchestration.get("implementer_model") != IMPLEMENTER_MODEL:
        die(f"orchestration.implementer_model must be {IMPLEMENTER_MODEL}")
    total = nonnegative_int(orchestration.get("tickets_total"), "orchestration.tickets_total")
    completed = nonnegative_int(orchestration.get("tickets_completed"), "orchestration.tickets_completed")
    peak_writers = nonnegative_int(orchestration.get("peak_active_writers"), "orchestration.peak_active_writers")
    if completed > total:
        die("orchestration.tickets_completed cannot exceed tickets_total")
    if require_complete and (total < 1 or completed != total):
        die("successful receipt requires at least one ticket and all tickets completed")
    if require_complete and peak_writers < 1:
        die("successful receipt requires at least one active implementer")
    text(orchestration.get("capacity_evidence"), "orchestration.capacity_evidence")
    text(orchestration.get("integration_evidence"), "orchestration.integration_evidence")
    return commander_id


def validate_items(items, kind, require_pass=True):
    if not isinstance(items, list) or (kind in {"criteria", "checks"} and not items):
        detail = "contain at least one acceptance criterion" if kind == "criteria" else "contain at least one check"
        die(f"{kind} must {detail}")
    for index, item in enumerate(items):
        item = obj(item, f"{kind}[{index}]")
        key = "id" if kind == "criteria" else "name"
        text(item.get(key), f"{kind}[{index}].{key}")
        text(item.get("evidence"), f"{kind}[{index}].evidence")
        if require_pass:
            allowed = {"passed"} if kind == "criteria" else {"passed", "not_applicable"}
        else:
            allowed = {"passed", "failed", "not_run"}
            if kind == "checks":
                allowed.add("not_applicable")
        if item.get("status") not in allowed:
            die(f"{kind}[{index}].status is unsupported")


def validate_git(git):
    git = obj(git, "git")
    text(git.get("base_branch"), "git.base_branch")
    text(git.get("delivery_branch"), "git.delivery_branch")
    if not isinstance(git.get("commits"), list) or not git["commits"]:
        die("git.commits must contain at least one commit")
    for index, commit in enumerate(git["commits"]):
        git_sha(commit, f"git.commits[{index}]")


def validate_reviews(reviews, commander_id=None, require_pass=True):
    reviews = obj(reviews, "reviews")
    reviewer_ids = []
    for key in ("goal_spec", "engineering_release"):
        review = obj(reviews.get(key), f"reviews.{key}")
        reviewer_id = text(review.get("reviewer"), f"reviews.{key}.reviewer")
        reviewer_ids.append(reviewer_id)
        if review.get("model") != COMMANDER_MODEL:
            die(f"reviews.{key}.model must be {COMMANDER_MODEL}")
        if review.get("reasoning_effort") not in REVIEWER_EFFORTS:
            die(f"reviews.{key}.reasoning_effort must be high, xhigh, or ultra")
        allowed_statuses = {"passed"} if require_pass else {"passed", "failed", "not_run"}
        if review.get("status") not in allowed_statuses:
            die(f"reviews.{key}.status is unsupported")
        text(review.get("evidence"), f"reviews.{key}.evidence")
    if reviewer_ids[0] == reviewer_ids[1]:
        die("final reviewer identities must be distinct")
    if commander_id and commander_id in reviewer_ids:
        die("commander cannot be a final reviewer")


def validate_pull_request(pull_request):
    pull_request = obj(pull_request, "pull_request")
    web_url(pull_request.get("url"), "pull_request.url")
    if pull_request.get("status") not in {"open", "ready", "merged"}:
        die("pull_request.status is unsupported")
    if not isinstance(pull_request.get("merged"), bool):
        die("pull_request.merged must be a boolean")
    if pull_request.get("merge_sha") is not None:
        git_sha(pull_request.get("merge_sha"), "pull_request.merge_sha")


def validate_release(release):
    release = obj(release, "release")
    mechanism = release.get("deploy_mechanism")
    if mechanism != "none_detected":
        text(mechanism, "release.deploy_mechanism")
    if release.get("status") not in {"passed", "not_applicable"}:
        die("release.status is unsupported")
    if release.get("url") is not None:
        web_url(release.get("url"), "release.url")
    for field in ("migrations", "backfills"):
        if release.get(field) not in {"passed", "validated", "none"}:
            die(f"release.{field} must be passed, validated, or none")
    if release.get("post_release_checks") not in {"passed", "not_applicable"}:
        die("release.post_release_checks is unsupported")
    for field in ("deployment_evidence", "migrations_evidence", "backfills_evidence", "post_release_evidence"):
        text(release.get(field), f"release.{field}")
    return release


def validate_optional_blocked(root, resolved_effort):
    commander_id = validate_orchestration(root["orchestration"], False, resolved_effort) if "orchestration" in root else None
    if "git" in root:
        validate_git(root["git"])
    if "criteria" in root:
        validate_items(root["criteria"], "criteria", False)
    if "checks" in root:
        validate_items(root["checks"], "checks", False)
    if "reviews" in root:
        validate_reviews(root["reviews"], commander_id, False)
    if "pull_request" in root:
        validate_pull_request(root["pull_request"])
    if "release" in root:
        validate_release(root["release"])


def unshipped_release(release, require_no_deploy):
    return (
        (not require_no_deploy or release.get("deploy_mechanism") == "none_detected")
        and release.get("status") == "not_applicable"
        and release.get("url") is None
        and release.get("migrations") in {"validated", "none"}
        and release.get("backfills") in {"validated", "none"}
        and release.get("post_release_checks") == "not_applicable"
        and (not require_no_deploy or "no deploy" in release["deployment_evidence"].lower())
    )


def validate(path):
    try:
        root = obj(json.loads(path.read_text(encoding="utf-8")), "receipt")
    except FileNotFoundError:
        die(f"file not found: {path}")
    except json.JSONDecodeError as exc:
        die(f"invalid JSON at line {exc.lineno}, column {exc.colno}")
    if root.get("schema_version") != 2:
        die("schema_version must be 2")
    mode, terminal = root.get("mode"), root.get("terminal_state")
    if mode not in {"pr", "release"}:
        die("mode must be pr or release")
    if terminal not in {"pr_ready", "merged_main", "released", "blocked"}:
        die("terminal_state is unsupported")
    plan = obj(root.get("plan"), "plan")
    if plan.get("approved") is not True:
        die("plan.approved must be true")
    text(plan.get("source"), "plan.source")
    resolved_effort = validate_effort(root.get("effort"))
    blockers = root.get("blockers")
    if not isinstance(blockers, list):
        die("blockers must be an array")
    if terminal == "blocked":
        if not blockers:
            die("blocked terminal_state requires at least one blocker")
        for index, blocker in enumerate(blockers):
            blocker = obj(blocker, f"blockers[{index}]")
            text(blocker.get("reason"), f"blockers[{index}].reason")
            text(blocker.get("evidence"), f"blockers[{index}].evidence")
        validate_optional_blocked(root, resolved_effort)
        return terminal
    if blockers:
        die("successful terminal_state cannot contain blockers")
    commander_id = validate_orchestration(root.get("orchestration"), True, resolved_effort)
    validate_git(root.get("git"))
    validate_items(root.get("criteria"), "criteria")
    validate_items(root.get("checks"), "checks")
    validate_reviews(root.get("reviews"), commander_id)
    validate_pull_request(root.get("pull_request"))
    pull_request = root["pull_request"]
    release = validate_release(root.get("release"))
    if mode == "pr":
        if terminal != "pr_ready":
            die("pr mode requires terminal_state pr_ready")
        if pull_request.get("merged") is not False or pull_request.get("status") not in {"open", "ready"}:
            die("pr_ready requires an open, unmerged PR/MR")
        if pull_request.get("merge_sha") is not None:
            die("pr_ready requires pull_request.merge_sha to be null")
        if not unshipped_release(release, False):
            die("pr_ready requires a detected-or-none, not-executed release record")
        return terminal
    if pull_request.get("merged") is not True or pull_request.get("status") != "merged":
        die("release mode requires a merged PR/MR")
    git_sha(pull_request.get("merge_sha"), "pull_request.merge_sha")
    mechanism = release.get("deploy_mechanism")
    if mechanism == "none_detected":
        if terminal != "merged_main":
            die("no deploy mechanism requires terminal_state merged_main")
        if not unshipped_release(release, True):
            die("merged_main requires a not_applicable release record")
        return terminal
    if terminal != "released" or release.get("status") != "passed":
        die("a detected deploy mechanism requires passed released terminal state")
    web_url(release.get("url"), "release.url")
    if release.get("migrations") not in {"passed", "none"} or release.get("backfills") not in {"passed", "none"}:
        die("released requires migrations and backfills to be passed or none")
    if release.get("post_release_checks") != "passed":
        die("released requires passed post_release_checks")
    return terminal


if __name__ == "__main__":
    if len(sys.argv) != 2:
        die("usage: validate_receipt.py RECEIPT.json")
    print(f"valid Auto Pilot receipt: {validate(Path(sys.argv[1]).expanduser())}")
