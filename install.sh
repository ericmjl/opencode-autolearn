#!/usr/bin/env bash
# opencode-autolearn installer
#
# Usage:
#   bash install.sh                    # run from cloned repo
#   bash install.sh /path/to/repo      # specify repo path
#
# Or one-liner:
#   curl -fsSL https://raw.githubusercontent.com/ericmjl/opencode-autolearn/main/install.sh | bash

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"

if [[ ! -f "$REPO_DIR/plugin/autolearn.js" ]]; then
  echo "Error: could not find plugin/autolearn.js in $REPO_DIR"
  echo "Clone the repo first: git clone https://github.com/ericmjl/opencode-autolearn.git"
  exit 1
fi

PLUGIN_DIR="$HOME/.config/opencode/plugins"
SKILLS_DIR="$HOME/.agents/skills"
OPENCODE_JSON="$HOME/.config/opencode/opencode.json"

echo "opencode-autolearn installer"
echo "============================"
echo ""

# 1. Copy plugin (v1 shell, v2 shell, shared core). The core uses a .mjs
# extension so OpenCode v2's plugins/ auto-discovery does not try to load
# it as a plugin (only .js/.ts files are discovered).
echo "[1/5] Installing plugin..."
mkdir -p "$PLUGIN_DIR"
cp "$REPO_DIR/plugin/autolearn.js" "$PLUGIN_DIR/"
cp "$REPO_DIR/plugin/autolearn-v2.js" "$PLUGIN_DIR/"
cp "$REPO_DIR/plugin/autolearn-core.mjs" "$PLUGIN_DIR/"
# Remove any stray pre-.mjs core copy from earlier installs (the .js name
# would be picked up by OpenCode v2's plugins/ auto-discovery and fail
# schema validation with a warning).
rm -f "$PLUGIN_DIR/autolearn-core.js"

# 2. Copy skills
echo "[2/5] Installing skills..."
mkdir -p "$SKILLS_DIR"
cp -r "$REPO_DIR/skills/autolearn-reviewer" "$SKILLS_DIR/"
cp -r "$REPO_DIR/skills/autolearn-curator" "$SKILLS_DIR/"
cp -r "$REPO_DIR/skills/self-improving-agent" "$SKILLS_DIR/"

# 3. Patch opencode.json
echo "[3/5] Configuring opencode.json..."
mkdir -p "$(dirname "$OPENCODE_JSON")"

python3 -c "
import json, os, sys

path = '$OPENCODE_JSON'

if os.path.exists(path):
    with open(path) as f:
        data = json.load(f)
else:
    data = {}

changed = False

# plugin — v1 shell (read by OpenCode v1 via the `plugin` key; OpenCode v2
# normalizes the same key, where the v1 function export is expected to fail
# schema validation with a warning — harmless, the v2 entry below is what
# v2 actually loads).
if 'plugin' not in data:
    data['plugin'] = []
plugins = data['plugin'] if isinstance(data['plugin'], list) else [data['plugin']]
plugin_entry = './plugins/autolearn.js'
if plugin_entry not in plugins:
    plugins.append(plugin_entry)
    data['plugin'] = plugins
    changed = True

# plugins — v2 shell (native v2 key; OpenCode v1 ignores unknown top-level
# keys, so both versions can share this file).
if 'plugins' not in data:
    data['plugins'] = []
plugins_v2 = data['plugins'] if isinstance(data['plugins'], list) else [data['plugins']]
plugin_v2_entry = './plugins/autolearn-v2.js'
if plugin_v2_entry not in plugins_v2:
    plugins_v2.append(plugin_v2_entry)
    data['plugins'] = plugins_v2
    changed = True

# instructions — point at the generated context view (Memory Insight);
# strip any superseded memory.md paths (persona + flat-layout).
if 'instructions' not in data:
    data['instructions'] = []
instructions = data['instructions'] if isinstance(data['instructions'], list) else [data['instructions']]
ctx_entry = os.path.expanduser('~/.autolearn/personas/default/memory.context.md')
# Strip superseded memory.md paths (persona + flat layout), matching both
# expanded absolute paths and literal-tilde forms.
superseded = {
    os.path.expanduser('~/.autolearn/personas/default/memory.md'),
    os.path.expanduser('~/.autolearn/memory.md'),
    '~/.autolearn/personas/default/memory.md',
    '~/.autolearn/memory.md',
}
if any(i in superseded for i in instructions):
    instructions = [i for i in instructions if i not in superseded]
    data['instructions'] = instructions
    changed = True
if ctx_entry not in instructions:
    instructions.append(ctx_entry)
    data['instructions'] = instructions
    changed = True

# agent
if 'agent' not in data:
    data['agent'] = {}
if 'autolearn-reviewer' not in data['agent']:
    data['agent']['autolearn-reviewer'] = {
        'description': 'Reviews past conversations for self-improvement opportunities',
        'hidden': True,
        'steps': 20,
        'prompt': 'Load the autolearn-reviewer skill and follow its instructions to review the attached conversation for learning opportunities. Take immediate action: record observations, update memory, create or patch skills.',
        'permission': {
            'bash': 'allow',
            'read': 'allow',
            'glob': 'allow',
            'grep': 'allow',
            'write': 'allow',
            'edit': 'deny',
            'webfetch': 'deny',
            'task': 'deny',
            'skill': 'allow',
            'external_directory': 'allow'
        }
    }
    changed = True

with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')

if changed:
    print('  Updated ' + path)
else:
    print('  Already configured (' + path + ')')
" 2>&1

# 4. Initialize + bootstrap the registry (migrates legacy memory.md if present)
echo "[4/5] Initializing autolearn store..."
CLI="$SKILLS_DIR/autolearn-reviewer/scripts/autolearn.py"
if command -v uv &>/dev/null; then
    uv run "$CLI" init
    uv run "$CLI" retention score   # migrates legacy store -> registry, scores tiers
    uv run "$CLI" memory compose    # generate memory.context.md from the registry
else
    echo "  Warning: uv not found. Run manually: uv run $CLI init"
fi

# 5. Verify
echo "[5/5] Verifying..."
OK=true
[[ -f "$PLUGIN_DIR/autolearn.js" ]] || { echo "  MISSING: $PLUGIN_DIR/autolearn.js"; OK=false; }
[[ -f "$PLUGIN_DIR/autolearn-v2.js" ]] || { echo "  MISSING: $PLUGIN_DIR/autolearn-v2.js"; OK=false; }
[[ -f "$PLUGIN_DIR/autolearn-core.mjs" ]] || { echo "  MISSING: $PLUGIN_DIR/autolearn-core.mjs"; OK=false; }
[[ -f "$SKILLS_DIR/autolearn-reviewer/SKILL.md" ]] || { echo "  MISSING: skills/autolearn-reviewer"; OK=false; }
[[ -f "$SKILLS_DIR/autolearn-curator/SKILL.md" ]] || { echo "  MISSING: skills/autolearn-curator"; OK=false; }
[[ -f "$SKILLS_DIR/self-improving-agent/SKILL.md" ]] || { echo "  MISSING: skills/self-improving-agent"; OK=false; }
[[ -f "$HOME/.autolearn/personas/default/memory.context.md" ]] || { echo "  MISSING: ~/.autolearn/personas/default/memory.context.md"; OK=false; }
[[ -f "$HOME/.autolearn/personas/default/memories.jsonl" ]] || { echo "  MISSING: ~/.autolearn/personas/default/memories.jsonl"; OK=false; }

echo ""
if $OK; then
    echo "Done! Autolearn will activate on your next OpenCode session."
else
    echo "Some files are missing — check the errors above."
    exit 1
fi
