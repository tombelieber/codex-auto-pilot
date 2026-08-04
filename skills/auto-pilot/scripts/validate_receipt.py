#!/usr/bin/env python3
"""Validate a minimal Auto Pilot version 3 completion receipt."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


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


def validate_git(value):
    value = obj(value, "git")
    text(value.get("base_branch"), "git.base_branch")
    text(value.get("delivery_branch"), "git.delivery_branch")
    commits = value.get("commits")
    if not isinstance(commits, list) or not commits:
        die("git.commits must contain at least one commit")
    for index, commit in enumerate(commits):
        git_sha(commit, f"git.commits[{index}]")


def validate_items(value, kind, require_pass):
    if not isinstance(value, list) or not value:
        die(f"{kind} must contain at least one item")
    passed = 0
    for index, item in enumerate(value):
        item = obj(item, f"{kind}[{index}]")
        key = "id" if kind == "criteria" else "name"
        text(item.get(key), f"{kind}[{index}].{key}")
        text(item.get("evidence"), f"{kind}[{index}].evidence")
        allowed = {"passed"} if kind == "criteria" else {"passed", "not_applicable"}
        if not require_pass:
            allowed |= {"failed", "not_run"}
        if item.get("status") not in allowed:
            die(f"{kind}[{index}].status is unsupported")
        if item.get("status") == "passed":
            passed += 1
    if require_pass and passed == 0:
        die(f"{kind} must contain at least one passed item")


def validate_pull_request(value):
    value = obj(value, "pull_request")
    web_url(value.get("url"), "pull_request.url")
    if value.get("status") not in {"open", "ready", "merged"}:
        die("pull_request.status is unsupported")
    if not isinstance(value.get("merged"), bool):
        die("pull_request.merged must be a boolean")
    if value.get("merge_sha") is not None:
        git_sha(value.get("merge_sha"), "pull_request.merge_sha")
    return value


def validate_release(value, allow_failed=False):
    value = obj(value, "release")
    statuses = {"not_requested", "no_mechanism", "passed"}
    if allow_failed:
        statuses.add("failed")
    if value.get("status") not in statuses:
        die("release.status is unsupported")
    if value.get("url") is not None:
        web_url(value.get("url"), "release.url")
    text(value.get("evidence"), "release.evidence")
    return value


def validate_optional_blocked(root):
    if "git" in root:
        validate_git(root["git"])
    if "criteria" in root:
        validate_items(root["criteria"], "criteria", False)
    if "checks" in root:
        validate_items(root["checks"], "checks", False)
    if "pull_request" in root:
        validate_pull_request(root["pull_request"])
    if "release" in root:
        validate_release(root["release"], True)


def validate(path):
    try:
        root = obj(json.loads(path.read_text(encoding="utf-8")), "receipt")
    except FileNotFoundError:
        die(f"file not found: {path}")
    except json.JSONDecodeError as exc:
        die(f"invalid JSON at line {exc.lineno}, column {exc.colno}")

    if root.get("schema_version") != 3:
        die("schema_version must be 3")
    mode = root.get("mode")
    terminal = root.get("terminal_state")
    if mode not in {"pr", "release"}:
        die("mode must be pr or release")
    if terminal not in {"pr_ready", "merged_main", "released", "blocked"}:
        die("terminal_state is unsupported")

    plan = obj(root.get("plan"), "plan")
    if plan.get("approved") is not True:
        die("plan.approved must be true")
    text(plan.get("source"), "plan.source")
    text(root.get("summary"), "summary")

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
        validate_optional_blocked(root)
        return terminal
    if blockers:
        die("successful terminal_state cannot contain blockers")

    validate_git(root.get("git"))
    validate_items(root.get("criteria"), "criteria", True)
    validate_items(root.get("checks"), "checks", True)
    pull_request = validate_pull_request(root.get("pull_request"))
    release = validate_release(root.get("release"))

    if terminal == "pr_ready":
        if mode != "pr":
            die("pr_ready requires mode pr")
        if pull_request.get("merged") is not False or pull_request.get("status") not in {"open", "ready"}:
            die("pr_ready requires an open, unmerged PR/MR")
        if pull_request.get("merge_sha") is not None:
            die("pr_ready requires pull_request.merge_sha to be null")
        if release.get("status") != "not_requested" or release.get("url") is not None:
            die("pr_ready requires release.status not_requested and a null URL")
        return terminal

    if mode != "release":
        die("merged_main and released require mode release")
    if pull_request.get("merged") is not True or pull_request.get("status") != "merged":
        die("release mode requires a merged PR/MR")
    git_sha(pull_request.get("merge_sha"), "pull_request.merge_sha")

    if terminal == "merged_main":
        if release.get("status") != "no_mechanism" or release.get("url") is not None:
            die("merged_main requires release.status no_mechanism and a null URL")
        return terminal

    if release.get("status") != "passed":
        die("released requires release.status passed")
    web_url(release.get("url"), "release.url")
    return terminal


if __name__ == "__main__":
    if len(sys.argv) != 2:
        die("usage: validate_receipt.py RECEIPT.json")
    print(f"valid Auto Pilot receipt: {validate(Path(sys.argv[1]).expanduser())}")
