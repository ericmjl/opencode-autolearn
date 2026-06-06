"""Autolearn CLI - manages ~/.autolearn/ store for self-improvement.

Commands:
  memory add/remove/list   Manage persistent memory
  user add/remove/list     Manage user profile
  skill create/patch/archive/list  Manage agent-created skills
  skill usage              Show skill usage telemetry
  curator run              Run skill consolidation and cleanup
  curator status           Show curator state
  init                     Initialize the autolearn store
"""

# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml", "python-slugify"]
# ///
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

import yaml
from slugify import slugify as python_slugify

# @spec KS-MEM-020
DATA_HOME = Path(os.environ.get("AUTOLEARN_HOME", Path.home() / ".autolearn"))
MEMORY_FILE = DATA_HOME / "memory.md"
USER_FILE = DATA_HOME / "user-profile.md"
CONFIG_FILE = DATA_HOME / "config.yaml"
SKILLS_DIR = DATA_HOME / "skills"
ARCHIVE_DIR = SKILLS_DIR / ".archive"
USAGE_FILE = SKILLS_DIR / ".usage.json"
CURATOR_STATE_FILE = DATA_HOME / ".curator_state.json"
OBSERVATIONS_FILE = DATA_HOME / "observations.jsonl"
AGENTS_SKILLS_DIR = Path(os.environ.get("AGENTS_SKILLS_DIR", Path.home() / ".agents" / "skills"))

MAX_MEMORY_CHARS = 3000
MAX_USER_CHARS = 2000


# @spec KS-MEM-001
def _ensure_dirs():
    DATA_HOME.mkdir(parents=True, exist_ok=True)
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)


def _read_md(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text()


def _write_md(path: Path, content: str):
    _ensure_dirs()
    path.write_text(content)


def _load_usage() -> dict:
    if USAGE_FILE.exists():
        try:
            return json.loads(USAGE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_usage(data: dict):
    _ensure_dirs()
    USAGE_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return yaml.safe_load(CONFIG_FILE.read_text()) or {}
        except Exception:
            pass
    return {}


def _load_curator_state() -> dict:
    if CURATOR_STATE_FILE.exists():
        try:
            return json.loads(CURATOR_STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"last_run": None, "runs": []}


def _save_curator_state(state: dict):
    _ensure_dirs()
    CURATOR_STATE_FILE.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n"
    )


def _slugify(text: str) -> str:
    return python_slugify(text, max_length=60)


# @spec KS-MEM-015, KS-MEM-016, KS-MEM-017
def _extract_entries(md: str) -> list[str]:
    entries = []
    in_comment = False
    for line in md.splitlines():
        stripped = line.strip()
        if stripped.startswith("<!--"):
            in_comment = True
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        if stripped.startswith("#") or stripped.startswith("<!--") or not stripped:
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
            entries.append(stripped[2:].strip())
        elif stripped and not stripped.startswith("#"):
            entries.append(stripped)
    return entries


# @spec KS-MEM-018, KS-MEM-019
def _entries_to_md(entries: list[str], header: str) -> str:
    md = f"# {header}\n\n"
    md += "<!-- Managed by autolearn. Do not edit the structure. -->\n\n"
    for entry in entries:
        md += f"- {entry}\n"
    return md


def _total_chars(entries: list[str]) -> int:
    return sum(len(e) for e in entries)


# @spec KS-MEM-006, KS-MEM-007, KS-MEM-008
def _trim_entries(entries: list[str], max_chars: int) -> list[str]:
    total = _total_chars(entries)
    if total <= max_chars:
        return entries
    while _total_chars(entries) > max_chars and len(entries) > 1:
        entries = entries[1:]
    return entries


# @spec KS-MEM-005
def _dedup(entries: list[str]) -> list[str]:
    seen = set()
    result = []
    for e in entries:
        normalized = e.lower().strip()
        if normalized not in seen:
            seen.add(normalized)
            result.append(e)
    return result


# @spec KS-MEM-002
def cmd_init(args):
    _ensure_dirs()
    if not MEMORY_FILE.exists():
        _write_md(MEMORY_FILE, "# Autolearn Memory\n\n<!-- Managed by autolearn. -->\n\n")
    if not USER_FILE.exists():
        _write_md(USER_FILE, "# User Profile\n\n<!-- Managed by autolearn. -->\n\n")
    if not CONFIG_FILE.exists():
        _write_md(CONFIG_FILE, "review_threshold: 10\nsession_review_on_idle: true\nmax_conversation_buffer: 50\ncurator_interval_days: 7\nstale_after_days: 30\narchive_after_days: 90\n")
    print(f"Initialized autolearn store at {DATA_HOME}")


# @spec KS-MEM-003, KS-MEM-005, KS-MEM-006
def cmd_memory_add(args):
    _ensure_dirs()
    content = args.content
    entries = _extract_entries(_read_md(MEMORY_FILE))
    entries.append(content)
    entries = _dedup(entries)
    entries = _trim_entries(entries, MAX_MEMORY_CHARS)
    _write_md(MEMORY_FILE, _entries_to_md(entries, "Autolearn Memory"))
    print(f"Memory updated ({len(entries)} entries, {_total_chars(entries)} chars)")


# @spec KS-MEM-009, KS-MEM-011
def cmd_memory_remove(args):
    entries = _extract_entries(_read_md(MEMORY_FILE))
    keyword = args.keyword.lower()
    before = len(entries)
    entries = [e for e in entries if keyword not in e.lower()]
    removed = before - len(entries)
    _write_md(MEMORY_FILE, _entries_to_md(entries, "Autolearn Memory"))
    print(f"Removed {removed} entries ({len(entries)} remaining)")


# @spec KS-MEM-012, KS-MEM-014
def cmd_memory_list(args):
    entries = _extract_entries(_read_md(MEMORY_FILE))
    if not entries:
        print("Memory is empty.")
        return
    for i, entry in enumerate(entries, 1):
        print(f"  {i}. {entry}")
    print(f"\nTotal: {len(entries)} entries, {_total_chars(entries)} chars")


# @spec KS-MEM-004, KS-MEM-005, KS-MEM-007
def cmd_user_add(args):
    _ensure_dirs()
    entries = _extract_entries(_read_md(USER_FILE))
    entries.append(args.content)
    entries = _dedup(entries)
    entries = _trim_entries(entries, MAX_USER_CHARS)
    _write_md(USER_FILE, _entries_to_md(entries, "User Profile"))
    print(f"User profile updated ({len(entries)} entries)")


# @spec KS-MEM-010, KS-MEM-011
def cmd_user_remove(args):
    entries = _extract_entries(_read_md(USER_FILE))
    keyword = args.keyword.lower()
    before = len(entries)
    entries = [e for e in entries if keyword not in e.lower()]
    _write_md(USER_FILE, _entries_to_md(entries, "User Profile"))
    print(f"Removed {before - len(entries)} entries ({len(entries)} remaining)")


# @spec KS-MEM-013
def cmd_user_list(args):
    entries = _extract_entries(_read_md(USER_FILE))
    if not entries:
        print("User profile is empty.")
        return
    for i, entry in enumerate(entries, 1):
        print(f"  {i}. {entry}")


# @spec SM-SC-001, SM-SC-002, SM-SC-003, SM-SC-004, SM-SC-005
def cmd_skill_create(args):
    _ensure_dirs()
    name = _slugify(args.name)
    desc = args.description
    skill_dir = SKILLS_DIR / name
    skill_file = skill_dir / "SKILL.md"

    if skill_file.exists():
        print(f"Skill already exists: {name}")
        sys.exit(1)

    skill_dir.mkdir(parents=True, exist_ok=True)

    content = f"""---
name: {name}
description: |
  {desc}
created_by: autolearn
created_at: "{date.today().isoformat()}"
---

# {name.replace("-", " ").title()}

{desc}

## Instructions

TODO: Add specific instructions based on observed patterns.
"""
    skill_file.write_text(content)

    usage = _load_usage()
    usage[name] = {
        "created_by": "autolearn",
        "created_at": date.today().isoformat(),
        "use_count": 0,
        "patch_count": 0,
        "last_activity_at": date.today().isoformat(),
        "state": "active",
    }
    _save_usage(usage)

    link_path = AGENTS_SKILLS_DIR / name
    AGENTS_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    if not link_path.exists():
        link_path.symlink_to(skill_dir)

    print(f"Created skill: {name} at {skill_dir} (linked to {link_path})")


# @spec SM-SP-001, SM-SP-002, SM-SP-003, SM-SP-004, SM-SP-005
def cmd_skill_patch(args):
    name = _slugify(args.name)
    section = args.section
    content = args.content
    skill_file = SKILLS_DIR / name / "SKILL.md"

    if not skill_file.exists():
        print(f"Skill not found: {name}")
        sys.exit(1)

    existing = skill_file.read_text()

    section_header = f"## {section}"
    if section_header in existing:
        lines = existing.splitlines()
        new_lines = []
        in_section = False
        inserted = False
        for line in lines:
            if line.strip() == section_header:
                in_section = True
                new_lines.append(line)
                continue
            if in_section and line.startswith("## ") and line.strip() != section_header:
                if not inserted:
                    new_lines.append(f"- {content}")
                    inserted = True
                in_section = False
                new_lines.append(line)
                continue
            if in_section:
                new_lines.append(line)
                continue
            new_lines.append(line)
        if in_section and not inserted:
            new_lines.append(f"- {content}")
        existing = "\n".join(new_lines)
    else:
        existing = existing.rstrip() + f"\n\n{section_header}\n\n- {content}\n"

    skill_file.write_text(existing)

    usage = _load_usage()
    if name in usage:
        usage[name]["patch_count"] = usage[name].get("patch_count", 0) + 1
        usage[name]["last_activity_at"] = date.today().isoformat()
    _save_usage(usage)

    print(f"Patched skill: {name} (section: {section})")


# @spec SM-SA-001, SM-SA-002, SM-SA-003, SM-SA-004, SM-SA-005
def cmd_skill_archive(args):
    name = _slugify(args.name)
    skill_dir = SKILLS_DIR / name

    if not skill_dir.exists():
        print(f"Skill not found: {name}")
        sys.exit(1)

    dest = ARCHIVE_DIR / name
    if dest.exists():
        print(f"Skill already archived: {name}")
        sys.exit(1)

    skill_dir.rename(dest)

    link_path = AGENTS_SKILLS_DIR / name
    if link_path.is_symlink():
        link_path.unlink()

    usage = _load_usage()
    if name in usage:
        usage[name]["state"] = "archived"
        usage[name]["archived_at"] = date.today().isoformat()
    _save_usage(usage)

    print(f"Archived skill: {name}")


# @spec SM-SL-001, SM-SL-002
def cmd_skill_list(args):
    usage = _load_usage()
    if not usage:
        print("No skills created yet.")
        return

    for name, meta in sorted(usage.items()):
        state = meta.get("state", "active")
        count = meta.get("use_count", 0)
        patches = meta.get("patch_count", 0)
        last = meta.get("last_activity_at", "unknown")
        print(f"  {name} [{state}] uses={count} patches={patches} last={last}")


# @spec SM-SU-001, SM-SU-002
def cmd_skill_usage(args):
    usage = _load_usage()
    if not usage:
        print("No usage data.")
        return
    print(json.dumps(usage, indent=2))


# @spec SM-LC-001, SM-LC-002, SM-LC-003, SM-LC-004
# @spec SM-LC-005, SM-LC-006, SM-LC-007
# @spec SM-LC-008, SM-LC-009, SM-LC-011, SM-LC-012
def cmd_curator_run(args):
    config = _load_config()
    stale_days = config.get("stale_after_days", 30)
    archive_days = config.get("archive_after_days", 90)
    today = date.today()

    usage = _load_usage()
    state = _load_curator_state()

    transitions = {"stale": [], "archived": [], "active": []}

    for name, meta in list(usage.items()):
        if meta.get("state") == "archived":
            continue
        if meta.get("pinned"):
            continue
        if meta.get("created_by") != "autolearn":
            continue

        last_str = meta.get("last_activity_at")
        if not last_str:
            continue

        try:
            last_date = date.fromisoformat(last_str)
        except ValueError:
            continue

        days_inactive = (today - last_date).days
        current_state = meta.get("state", "active")

        if days_inactive >= archive_days and current_state != "archived":
            skill_dir = SKILLS_DIR / name
            if skill_dir.exists() and not (ARCHIVE_DIR / name).exists():
                skill_dir.rename(ARCHIVE_DIR / name)
            meta["state"] = "archived"
            meta["archived_at"] = today.isoformat()
            transitions["archived"].append(name)
        elif days_inactive >= stale_days and current_state == "active":
            meta["state"] = "stale"
            transitions["stale"].append(name)

    _save_usage(usage)

    run_record = {
        "date": today.isoformat(),
        "transitions": transitions,
    }
    state["last_run"] = today.isoformat()
    state["runs"].append(run_record)
    _save_curator_state(state)

    total = sum(len(v) for v in transitions.values())
    if total == 0:
        print("Curator run complete: no transitions needed.")
    else:
        print(f"Curator run complete:")
        for action, names in transitions.items():
            if names:
                print(f"  {action}: {', '.join(names)}")


# @spec SM-LC-010
def cmd_curator_status(args):
    state = _load_curator_state()
    usage = _load_usage()

    active = sum(1 for m in usage.values() if m.get("state") == "active")
    stale = sum(1 for m in usage.values() if m.get("state") == "stale")
    archived = sum(1 for m in usage.values() if m.get("state") == "archived")

    print(f"Skills: {active} active, {stale} stale, {archived} archived")
    print(f"Last curator run: {state.get('last_run', 'never')}")
    print(f"Total runs: {len(state.get('runs', []))}")


def main():
    parser = argparse.ArgumentParser(
        prog="autolearn",
        description="Autolearn CLI - manages self-improvement store",
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("init", help="Initialize the autolearn store")

    mem = sub.add_parser("memory", help="Manage persistent memory")
    mem_sub = mem.add_subparsers(dest="subcommand")
    mem_add = mem_sub.add_parser("add", help="Add a memory entry")
    mem_add.add_argument("content", help="The lesson to remember")
    mem_rm = mem_sub.add_parser("remove", help="Remove entries matching keyword")
    mem_rm.add_argument("keyword", help="Keyword to match")
    mem_sub.add_parser("list", help="List all memory entries")

    usr = sub.add_parser("user", help="Manage user profile")
    usr_sub = usr.add_subparsers(dest="subcommand")
    usr_add = usr_sub.add_parser("add", help="Add a preference")
    usr_add.add_argument("content", help="The preference to record")
    usr_rm = usr_sub.add_parser("remove", help="Remove entries matching keyword")
    usr_rm.add_argument("keyword", help="Keyword to match")
    usr_sub.add_parser("list", help="List all user profile entries")

    sk = sub.add_parser("skill", help="Manage agent-created skills")
    sk_sub = sk.add_subparsers(dest="subcommand")
    sk_create = sk_sub.add_parser("create", help="Create a new skill")
    sk_create.add_argument("name", help="Skill name")
    sk_create.add_argument("description", help="Skill description")
    sk_patch = sk_sub.add_parser("patch", help="Patch an existing skill")
    sk_patch.add_argument("name", help="Skill name")
    sk_patch.add_argument("section", help="Section to patch")
    sk_patch.add_argument("content", help="Content to add")
    sk_archive = sk_sub.add_parser("archive", help="Archive a skill")
    sk_archive.add_argument("name", help="Skill name")
    sk_sub.add_parser("list", help="List all agent-created skills")
    sk_sub.add_parser("usage", help="Show usage telemetry")

    cur = sub.add_parser("curator", help="Skill lifecycle management")
    cur_sub = cur.add_subparsers(dest="subcommand")
    cur_sub.add_parser("run", help="Run curator (stale/archive transitions)")
    cur_sub.add_parser("status", help="Show curator state")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    commands = {
        "init": cmd_init,
        "memory": {
            "add": cmd_memory_add,
            "remove": cmd_memory_remove,
            "list": cmd_memory_list,
        },
        "user": {
            "add": cmd_user_add,
            "remove": cmd_user_remove,
            "list": cmd_user_list,
        },
        "skill": {
            "create": cmd_skill_create,
            "patch": cmd_skill_patch,
            "archive": cmd_skill_archive,
            "list": cmd_skill_list,
            "usage": cmd_skill_usage,
        },
        "curator": {
            "run": cmd_curator_run,
            "status": cmd_curator_status,
        },
    }

    cmd_map = commands.get(args.command)
    if isinstance(cmd_map, dict):
        subcmd = getattr(args, "subcommand", None)
        if not subcmd:
            print(f"Usage: autolearn {args.command} <subcommand>")
            sys.exit(1)
        fn = cmd_map.get(subcmd)
        if fn:
            _ensure_dirs()
            fn(args)
        else:
            print(f"Unknown subcommand: {args.command} {subcmd}")
            sys.exit(1)
    elif callable(cmd_map):
        _ensure_dirs()
        cmd_map(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
