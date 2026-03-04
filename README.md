# AskQA Plugins for Claude Code

Official plugins for [AskQA](https://askqa.ai) integration with Claude Code.

## Installation

```bash
/plugin marketplace add yourusername/askqa-plugins
/plugin install askqa
```

Then configure your AskQA API credentials in `.mcp.json`:

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

Get your API key from [askqa.ai/account](https://askqa.ai/account).

## Available Skills

- `/askqa:setup-slack` - Configure Slack notifications for test failures
- `/askqa:shopify-add-to-cart` - Set up Shopify cart monitoring

## Available MCP Tools

Once configured, you also get access to MCP tools for test management:

- `list_tests` - List all saved tests
- `create_test` - Create a new test
- `run_test` - Run a test and get results
- `schedule_test` - Schedule recurring test runs
- `get_test_results` - View test run history
- `add_notification_channel` - Configure email, Telegram, or Slack alerts
- And more...

## About AskQA

AskQA is an automated website testing and monitoring service. Visit [askqa.ai](https://askqa.ai) to learn more.
