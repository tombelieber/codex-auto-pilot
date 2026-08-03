#!/usr/bin/env python3
"""Validate an Auto Pilot terminal receipt without external dependencies."""

import json
import sys
from pathlib import Path


def die(message):
    print(f"invalid receipt: {message}", file=sys.stderr)
    raise SystemExit(1)


def obj(value, name):
    if not isinstance(value, dict): die(f"{name} must be an object")
    return value


def text(value, name):
    if not isinstance(value, str) or not value.strip(): die(f"{name} must be a non-empty string")
    return value.strip()


def validate_items(items, kind):
    if not isinstance(items, list) or (kind == "criteria" and not items): die(f"{kind} must {'contain at least one acceptance criterion' if kind == 'criteria' else 'be an array'}")
    for i, item in enumerate(items):
        item = obj(item, f"{kind}[{i}]")
        text(item.get("id" if kind == "criteria" else "name"), f"{kind}[{i}].{'id' if kind == 'criteria' else 'name'}")
        text(item.get("evidence"), f"{kind}[{i}].evidence")
        allowed = {"passed"} if kind == "criteria" else {"passed", "not_applicable"}
        if item.get("status") not in allowed: die(f"{kind}[{i}].status must be {'passed' if kind == 'criteria' else 'passed or not_applicable'}")


def validate(path):
    try: root = obj(json.loads(path.read_text(encoding="utf-8")), "receipt")
    except FileNotFoundError: die(f"file not found: {path}")
    except json.JSONDecodeError as exc: die(f"invalid JSON at line {exc.lineno}, column {exc.colno}")
    if root.get("schema_version") != 1: die("schema_version must be 1")
    mode, terminal = root.get("mode"), root.get("terminal_state")
    if mode not in {"pr", "release"}: die("mode must be pr or release")
    if terminal not in {"pr_ready", "merged_main", "released", "blocked"}: die("terminal_state is unsupported")
    plan = obj(root.get("plan"), "plan")
    if plan.get("approved") is not True: die("plan.approved must be true")
    text(plan.get("source"), "plan.source")
    blockers = root.get("blockers")
    if not isinstance(blockers, list): die("blockers must be an array")
    if terminal == "blocked":
        if not blockers: die("blocked terminal_state requires at least one blocker")
        for i, blocker in enumerate(blockers):
            blocker = obj(blocker, f"blockers[{i}]"); text(blocker.get("reason"), f"blockers[{i}].reason"); text(blocker.get("evidence"), f"blockers[{i}].evidence")
        return terminal
    if blockers: die("successful terminal_state cannot contain blockers")
    git = obj(root.get("git"), "git")
    text(git.get("base_branch"), "git.base_branch"); text(git.get("delivery_branch"), "git.delivery_branch")
    if not isinstance(git.get("commits"), list) or not git["commits"]: die("git.commits must contain at least one commit")
    validate_items(root.get("criteria"), "criteria"); validate_items(root.get("checks"), "checks")
    reviews = obj(root.get("reviews"), "reviews")
    for key in ("goal_spec", "engineering_release"):
        review = obj(reviews.get(key), f"reviews.{key}")
        if review.get("status") != "passed": die(f"reviews.{key}.status must be passed")
        text(review.get("evidence"), f"reviews.{key}.evidence")
    pr, release = obj(root.get("pull_request"), "pull_request"), obj(root.get("release"), "release")
    text(pr.get("url"), "pull_request.url")
    if mode == "pr":
        if terminal != "pr_ready": die("pr mode requires terminal_state pr_ready")
        if pr.get("merged") is not False or pr.get("status") not in {"open", "ready"}: die("pr_ready requires an open, unmerged PR/MR")
        return terminal
    if pr.get("merged") is not True or pr.get("status") != "merged": die("release mode requires a merged PR/MR")
    text(pr.get("merge_sha"), "pull_request.merge_sha")
    mechanism = release.get("deploy_mechanism")
    if mechanism == "none_detected":
        if terminal != "merged_main": die("no deploy mechanism requires terminal_state merged_main")
        return terminal
    text(mechanism, "release.deploy_mechanism")
    if terminal != "released" or release.get("status") != "passed": die("a detected deploy mechanism requires passed released terminal state")
    text(release.get("url"), "release.url")
    if release.get("migrations") not in {"passed", "none"} or release.get("backfills") not in {"passed", "none"}: die("release migrations and backfills must be passed or none")
    if release.get("post_release_checks") != "passed": die("released requires passed post_release_checks")
    return terminal


if __name__ == "__main__":
    if len(sys.argv) != 2: die("usage: validate_receipt.py RECEIPT.json")
    print(f"valid Auto Pilot receipt: {validate(Path(sys.argv[1]).expanduser())}")
