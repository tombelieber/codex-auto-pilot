#!/usr/bin/env python3
"""Validate an Auto Pilot terminal receipt without external dependencies."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


def die(message):
    print(f"invalid receipt: {message}", file=sys.stderr)
    raise SystemExit(1)


def obj(value, name):
    if not isinstance(value, dict): die(f"{name} must be an object")
    return value


def text(value, name):
    if not isinstance(value, str) or not value.strip(): die(f"{name} must be a non-empty string")
    return value.strip()


def git_sha(value, name):
    value = text(value, name)
    if not re.fullmatch(r"[0-9a-fA-F]{7,64}", value): die(f"{name} must be a 7-64 character hexadecimal Git id")
    return value


def web_url(value, name):
    value = text(value, name)
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname: die(f"{name} must be an http/https URL with a host")
    return value


def validate_items(items, kind):
    if not isinstance(items, list) or (kind in {"criteria", "checks"} and not items): die(f"{kind} must {'contain at least one acceptance criterion' if kind == 'criteria' else 'contain at least one check'}")
    for i, item in enumerate(items):
        item = obj(item, f"{kind}[{i}]")
        text(item.get("id" if kind == "criteria" else "name"), f"{kind}[{i}].{'id' if kind == 'criteria' else 'name'}")
        text(item.get("evidence"), f"{kind}[{i}].evidence")
        allowed = {"passed"} if kind == "criteria" else {"passed", "not_applicable"}
        if item.get("status") not in allowed: die(f"{kind}[{i}].status must be {'passed' if kind == 'criteria' else 'passed or not_applicable'}")


def validate_git(git):
    git = obj(git, "git")
    text(git.get("base_branch"), "git.base_branch"); text(git.get("delivery_branch"), "git.delivery_branch")
    if not isinstance(git.get("commits"), list) or not git["commits"]: die("git.commits must contain at least one commit")
    for i, commit in enumerate(git["commits"]): git_sha(commit, f"git.commits[{i}]")


def validate_reviews(reviews):
    reviews = obj(reviews, "reviews")
    for key in ("goal_spec", "engineering_release"):
        review = obj(reviews.get(key), f"reviews.{key}")
        if review.get("status") != "passed": die(f"reviews.{key}.status must be passed")
        text(review.get("evidence"), f"reviews.{key}.evidence")


def validate_pull_request(pr):
    pr = obj(pr, "pull_request")
    web_url(pr.get("url"), "pull_request.url")
    if pr.get("status") not in {"open", "ready", "merged"}: die("pull_request.status is unsupported")
    if not isinstance(pr.get("merged"), bool): die("pull_request.merged must be a boolean")
    if pr.get("merge_sha") is not None: git_sha(pr.get("merge_sha"), "pull_request.merge_sha")


def validate_release(release):
    release = obj(release, "release")
    mechanism = release.get("deploy_mechanism")
    if mechanism != "none_detected": text(mechanism, "release.deploy_mechanism")
    if release.get("status") not in {"passed", "not_applicable"}: die("release.status is unsupported")
    if release.get("url") is not None: web_url(release.get("url"), "release.url")
    for field in ("migrations", "backfills"):
        if release.get(field) not in {"passed", "none"}: die(f"release.{field} must be passed or none")
    if release.get("post_release_checks") not in {"passed", "not_applicable"}: die("release.post_release_checks is unsupported")
    for field in ("deployment_evidence", "migrations_evidence", "backfills_evidence", "post_release_evidence"):
        text(release.get(field), f"release.{field}")
    return release


def validate_optional_blocked(root):
    if "git" in root: validate_git(root["git"])
    if "criteria" in root: validate_items(root["criteria"], "criteria")
    if "checks" in root: validate_items(root["checks"], "checks")
    if "reviews" in root: validate_reviews(root["reviews"])
    if "pull_request" in root: validate_pull_request(root["pull_request"])
    if "release" in root: validate_release(root["release"])


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
        validate_optional_blocked(root)
        return terminal
    if blockers: die("successful terminal_state cannot contain blockers")
    validate_git(root.get("git"))
    validate_items(root.get("criteria"), "criteria"); validate_items(root.get("checks"), "checks")
    validate_reviews(root.get("reviews"))
    validate_pull_request(root.get("pull_request")); pr = root["pull_request"]
    release = validate_release(root.get("release"))
    if mode == "pr":
        if terminal != "pr_ready": die("pr mode requires terminal_state pr_ready")
        if pr.get("merged") is not False or pr.get("status") not in {"open", "ready"}: die("pr_ready requires an open, unmerged PR/MR")
        if pr.get("merge_sha") is not None: die("pr_ready requires pull_request.merge_sha to be null")
        if not not_no_deploy_release(release): die("pr_ready requires a not_applicable release record")
        return terminal
    if pr.get("merged") is not True or pr.get("status") != "merged": die("release mode requires a merged PR/MR")
    git_sha(pr.get("merge_sha"), "pull_request.merge_sha")
    mechanism = release.get("deploy_mechanism")
    if mechanism == "none_detected":
        if terminal != "merged_main": die("no deploy mechanism requires terminal_state merged_main")
        if not not_no_deploy_release(release): die("merged_main requires a not_applicable release record")
        return terminal
    if terminal != "released" or release.get("status") != "passed": die("a detected deploy mechanism requires passed released terminal state")
    web_url(release.get("url"), "release.url")
    if release.get("post_release_checks") != "passed": die("released requires passed post_release_checks")
    return terminal


def not_no_deploy_release(release):
    return release.get("deploy_mechanism") == "none_detected" and release.get("status") == "not_applicable" and release.get("url") is None and release.get("migrations") == "none" and release.get("backfills") == "none" and release.get("post_release_checks") == "not_applicable" and "no deploy" in release["deployment_evidence"].lower()


if __name__ == "__main__":
    if len(sys.argv) != 2: die("usage: validate_receipt.py RECEIPT.json")
    print(f"valid Auto Pilot receipt: {validate(Path(sys.argv[1]).expanduser())}")
