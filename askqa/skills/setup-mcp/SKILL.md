---
name: setup-mcp
description: Configure AskQA MCP server with API key
---

# Set Up AskQA MCP Server

Use this skill to automatically configure the AskQA MCP server in your Claude settings.

## Step 1: Get API Key

Ask the user if they already have an AskQA API key. If not, direct them to:
- Sign up at https://askqa.ai
- Get their API key from https://askqa.ai/account

Once they have the key, ask them to provide it.

## Step 2: Detect Environment

Check if the user is in a git repository by looking for a `.git` directory in the current working directory or parent directories.

Use the Bash tool:
```bash
git rev-parse --git-dir 2>/dev/null
```

If this succeeds, we're in a git repo. If it fails, we're in Desktop/global mode.

## Step 3: Determine Config Location

**If in a git repository:**
- Config location: `.mcp.json` in the project root (project-specific)
- This configuration will only apply when working in this repository

**If not in a git repository (Desktop mode):**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- This configuration will apply globally for the user

Tell the user which location will be used.

## Step 4: Read Existing Config

Use the Read tool to check if the config file exists and read its contents.

If the file doesn't exist, start with an empty config:
```json
{
  "mcpServers": {}
}
```

If the file exists, parse it as JSON.

## Step 5: Update Config

Add or update the `askqa` MCP server entry:

```json
{
  "mcpServers": {
    "askqa": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/askqa/server.js"],
      "env": {
        "AUTOQA_API_URL": "https://api.askqa.ai",
        "AUTOQA_API_KEY": "aq_..."
      }
    }
  }
}
```

**Important notes:**
- Use `${CLAUDE_PLUGIN_ROOT}` variable - it resolves to the plugin installation directory
- Replace `"aq_..."` with the actual API key the user provided
- Preserve any other MCP servers already configured
- If `askqa` already exists, update it with the new API key

## Step 6: Write Config

Use the Write tool to save the updated config back to the file.

**For project config (`.mcp.json`):**
- Write the config file to the project root

**For Desktop config:**
- Write directly to the Desktop config file location

## Step 7: Confirm

After writing the config, confirm with the user:

**If project config:**
```
✓ AskQA MCP server configured in .mcp.json

The MCP server is now available in this repository. Restart Claude Code to load it.

Try these commands:
- list_tests - List your saved tests
- create_test - Create a new test
```

**If Desktop config:**
```
✓ AskQA MCP server configured globally

The MCP server is now available in Claude Desktop. Restart Claude Desktop to load it.

You can now use AskQA tools in any conversation.
```

## Error Handling

If any step fails:
- **Permission error**: Tell user they may need to run with appropriate permissions
- **Invalid API key format**: Check that it starts with `aq_`
- **Invalid JSON**: If existing config is malformed, warn user and ask if they want to replace it

## Additional Tips

After successful setup, remind the user:
- They can verify the setup by restarting and running `list_tests`
- They can update the API key anytime by running this skill again
- Project configs (`.mcp.json`) can be committed to git for team sharing (but shouldn't include the API key - use environment variables instead for team setups)
