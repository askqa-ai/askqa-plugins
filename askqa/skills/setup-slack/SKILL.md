---
name: setup-slack
description: Configure Slack notifications for AskQA test failures
---

# Set Up Slack Notifications

Use this skill to configure Slack notifications for AskQA test failures. When a scheduled test fails, AskQA will post a message to your Slack channel with the test name, failed steps, and a link to the full results.

## Step 1: Create a Slack Incoming Webhook

Slack requires creating a lightweight "app" to generate a webhook URL — it takes under a minute and no coding is involved. Walk the user through these steps:

1. Go to https://api.slack.com/apps
2. Click **Create New App** > **From scratch**
3. Name it anything (e.g. "AskQA"), pick your workspace, click **Create App**
4. In the left sidebar, click **Incoming Webhooks**
5. Toggle **Activate Incoming Webhooks** to On
6. Click **Add New Webhook to Workspace** at the bottom
7. Choose the channel where you want failure alerts (e.g. `#qa-alerts`), click **Allow**
8. Copy the webhook URL — it looks like `https://hooks.slack.com/services/T.../B.../xxxx`

Ask the user to paste their webhook URL before proceeding.

## Step 2: Add the Notification Channel

Once you have the webhook URL, use the `add_notification_channel` MCP tool:

- `channel_type`: `slack`
- `webhook_url`: the URL the user provided

This will create the channel and automatically send a test message to verify it works.

## Step 3: Confirm

After the tool succeeds, let the user know:

- A test message was sent to their Slack channel — ask them to check that it arrived
- From now on, any scheduled test that fails will post an alert to that channel
- They can manage notification channels with `list_notification_channels` and `remove_notification_channel`

If the test message didn't arrive, suggest they double-check:
- The webhook URL is correct (starts with `https://hooks.slack.com/`)
- The Slack app has permission to post to the chosen channel
- The webhook hasn't been revoked in Slack's app settings
