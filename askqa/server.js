#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.AUTOQA_API_URL || "http://localhost:8081").replace(/\/$/, "");
const API_KEY = process.env.AUTOQA_API_KEY || "";
const WEBSITE_URL = (process.env.AUTOQA_WEBSITE_URL || "http://localhost:8080").replace(/\/$/, "");

if (!API_KEY) {
  console.error("AUTOQA_API_KEY is required. Set it in your MCP server config.");
  process.exit(1);
}

async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTestRun(testRunId, maxWaitMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const testRun = await apiGet(`/api/test-runs/${testRunId}`);
    if (testRun.status === "completed" || testRun.status === "failed") {
      return testRun;
    }
    await sleep(2000);
  }
  throw new Error(`Test run ${testRunId} did not finish within ${maxWaitMs / 1000}s`);
}

async function fetchScreenshot(url) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function buildTestRunText(testRun) {
  const icon = testRun.status === "completed" ? "✓" : testRun.status === "failed" ? "✗" : "…";
  const lines = [
    `${icon} Run #${testRun.id} | Test: ${testRun.test_id} | ${testRun.trigger_type} | ${testRun.status}`,
  ];

  if (testRun.result?.durationMs) {
    lines.push(`  Duration: ${(testRun.result.durationMs / 1000).toFixed(1)}s`);
  } else if (testRun.started_at && testRun.completed_at) {
    const duration = (new Date(testRun.completed_at) - new Date(testRun.started_at)) / 1000;
    lines.push(`  Duration: ${duration.toFixed(1)}s`);
  }

  if (testRun.completed_at) {
    lines.push(`  Completed: ${testRun.completed_at}`);
  }

  if (testRun.result?.steps) {
    for (const step of testRun.result.steps) {
      const icon = step.status === "passed" ? "✓" : step.status === "failed" ? "✗" : "?";
      lines.push(`  ${icon} ${step.name} — ${step.status}`);
      if (step.details) lines.push(`    ${step.details}`);
      if (step.error) lines.push(`    Error: ${step.error}`);
      if (step.screenshot) lines.push(`    Screenshot: ${step.screenshot}`);
    }
  }

  if (testRun.result?.error) {
    lines.push(`  Error: ${testRun.result.error}`);
  }
  if (testRun.error) {
    lines.push(`  Error: ${testRun.error}`);
  }

  const hasScreenshots = testRun.result?.steps?.some((s) => s.screenshot);
  if (hasScreenshots) {
    lines.push(`  Use get_test_screenshots with test_run_id ${testRun.id} to view screenshots.`);
  }

  lines.push(`  View details: ${testRun.details_url || `${WEBSITE_URL}/runs/${testRun.id}`}`);

  return lines.join("\n");
}

async function buildTestRunScreenshots(testRun) {
  const content = [];
  if (!testRun.result?.steps) return content;

  for (const step of testRun.result.steps) {
    if (!step.screenshot) continue;
    const stepName = step.screenshot.replace(/\.png$/, "");
    const url = `${API_URL}/api/test-runs/${testRun.id}/screenshots/${stepName}`;
    const base64 = await fetchScreenshot(url);
    if (base64) {
      content.push({ type: "image", data: base64, mimeType: "image/png" });
    }
  }
  return content;
}

const server = new McpServer(
  {
    name: "askqa",
    version: "1.0.0",
  },
  {
    instructions: [
      "AskQA monitors websites by running automated tests on a schedule.",
      "",
      'When the user asks whether something is working (e.g. "is checkout working?", "is the site up?"),',
      "your FIRST step should be to call list_tests to find a matching test by name or URL,",
      "then call get_test_results for that test to check the latest run status and step details.",
      "If the latest run passed, confirm it\'s working. If it failed, report what failed.",
      "Only call run_test if the user explicitly asks to run a new test — checking status should use existing results.",
    ].join("\n"),
  }
);

server.registerTool(
  "list_templates",
  {
    description: "List available test templates. Returns template IDs, names, descriptions, and steps.",
  },
  async () => {
    try {
      const data = await apiGet("/api/tests/templates");
      return { content: [{ type: "text", text: JSON.stringify(data.templates, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "create_test",
  {
    description: "Create a saved test. Use template_id for built-in templates, or code for custom Playwright tests. Provide one or the other, not both.",
    inputSchema: {
      name: z.string().describe("A name for this test (e.g. 'Homepage health check')"),
      url: z.string().describe("The target URL to test (e.g. 'https://example.com')"),
      template_id: z.string().optional().describe("Template ID from list_templates (e.g. 'quick-checks'). Omit if using code."),
      params: z.record(z.string()).optional().describe("Optional template parameters"),
      code: z.string().optional().describe("Custom Playwright test code. Must define an async function test({ page, step, log }). Omit if using template_id."),
    },
  },
  async ({ name, url, template_id, params, code }) => {
    try {
      const body = { name, url };
      if (template_id) body.template_id = template_id;
      if (params) body.params = params;
      if (code) body.code = code;
      const test = await apiPost("/api/tests/create", body);
      return { content: [{ type: "text", text: JSON.stringify(test, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "screenshot_url",
  {
    description: "Take a screenshot of a URL and extract page structure (links, buttons, inputs, headings with selectors). Use this BEFORE writing custom test code to see the page layout and discover available selectors.",
    inputSchema: {
      url: z.string().describe("The URL to screenshot (e.g. 'https://example.com')"),
    },
  },
  async ({ url }) => {
    try {
      const result = await apiPost("/api/tests/screenshot", { url });
      const content = [];

      // Page info as structured text
      const info = result.pageInfo || {};
      const lines = [`Page: ${info.title || "(no title)"}`, `URL: ${info.url || url}`, ""];

      if (info.headings?.length) {
        lines.push("Headings:");
        for (const h of info.headings) lines.push(`  <${h.tag}> ${h.text}`);
        lines.push("");
      }
      if (info.buttons?.length) {
        lines.push("Buttons:");
        for (const b of info.buttons) {
          const extra = b.disabled ? " (disabled)" : "";
          lines.push(`  "${b.text}"${extra}  →  ${b.selector}`);
        }
        lines.push("");
      }
      if (info.inputs?.length) {
        lines.push("Inputs:");
        for (const inp of info.inputs) {
          const desc = inp.placeholder || inp.name || inp.type || inp.tag;
          lines.push(`  [${desc}]  →  ${inp.selector}`);
        }
        lines.push("");
      }
      if (info.links?.length) {
        lines.push("Links:");
        for (const l of info.links) {
          lines.push(`  "${l.text}"  →  ${l.selector}`);
        }
        lines.push("");
      }

      content.push({ type: "text", text: lines.join("\n") });

      // Screenshot
      if (result.screenshot) {
        content.push({ type: "image", data: result.screenshot, mimeType: "image/png" });
      }

      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "validate_test",
  {
    description: "Dry-run custom Playwright test code against a URL. Returns execution results, screenshots, and page structure for debugging. Steps continue even on failure to maximize debug signal. Use this to iterate on code before calling create_test.",
    inputSchema: {
      code: z.string().describe("Custom Playwright test code. Must define an async function test({ page, step, log })."),
      url: z.string().describe("The target URL to test against (e.g. 'https://example.com')"),
    },
  },
  async ({ code, url }) => {
    try {
      const result = await apiPost("/api/tests/validate", { code, url });
      const content = [];

      // Build text summary
      const icon = result.status === "passed" ? "✓" : "✗";
      const lines = [`${icon} Validation: ${result.status}`];
      if (result.durationMs) lines.push(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
      if (result.error) lines.push(`  Error: ${result.error}`);
      for (const step of (result.steps || [])) {
        const stepIcon = step.status === "passed" ? "✓" : step.status === "failed" ? "✗" : "?";
        lines.push(`  ${stepIcon} ${step.name} — ${step.status}`);
        if (step.error) lines.push(`    Error: ${step.error}`);
      }
      if (result.logs?.length) {
        lines.push("  Logs:");
        for (const msg of result.logs) lines.push(`    ${msg}`);
      }
      content.push({ type: "text", text: lines.join("\n") });

      // Include page info for debugging selectors
      if (result.pageInfo) {
        const info = result.pageInfo;
        const infoLines = ["", "Page structure (for fixing selectors):"];
        if (info.buttons?.length) {
          infoLines.push("  Buttons:");
          for (const b of info.buttons) infoLines.push(`    "${b.text}"  →  ${b.selector}`);
        }
        if (info.inputs?.length) {
          infoLines.push("  Inputs:");
          for (const inp of info.inputs) {
            const desc = inp.placeholder || inp.name || inp.type || inp.tag;
            infoLines.push(`    [${desc}]  →  ${inp.selector}`);
          }
        }
        if (info.links?.length) {
          infoLines.push("  Links:");
          for (const l of info.links) infoLines.push(`    "${l.text}"  →  ${l.selector}`);
        }
        content.push({ type: "text", text: infoLines.join("\n") });
      }

      // Include screenshots as labeled images
      if (result.screenshots) {
        for (const [stepName, base64] of Object.entries(result.screenshots)) {
          if (base64) {
            content.push({ type: "text", text: `Screenshot: ${stepName}` });
            content.push({ type: "image", data: base64, mimeType: "image/png" });
          }
        }
      }

      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "list_tests",
  {
    description: "List all saved tests for the current organization. Returns id, name, url, template_id, status, and last_run summary (id, status, completed_at). This is the best starting point when checking if a feature or site is working — find the relevant test, then use get_test_results to see details.",
  },
  async () => {
    try {
      const data = await apiGet("/api/tests/list");
      return { content: [{ type: "text", text: JSON.stringify(data.tests, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "get_test",
  {
    description: "Get full details of a test by ID, including code for custom tests. Use list_tests to find the test ID first.",
    inputSchema: {
      test_id: z.coerce.number().describe("The test ID (from list_tests or create_test)"),
    },
  },
  async ({ test_id }) => {
    try {
      const test = await apiGet(`/api/tests/${test_id}`);
      return { content: [{ type: "text", text: JSON.stringify(test, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "update_test",
  {
    description: "Update an existing test's name, URL, code, or other properties. Only provided fields are changed.",
    inputSchema: {
      test_id: z.coerce.number().describe("The test ID to update (from list_tests or get_test)"),
      name: z.string().optional().describe("New test name"),
      url: z.string().optional().describe("New target URL"),
      code: z.string().optional().describe("Updated custom Playwright test code"),
      template_id: z.string().optional().describe("Updated template ID"),
      params: z.record(z.string()).optional().describe("Updated template parameters"),
    },
  },
  async ({ test_id, name, url, code, template_id, params }) => {
    try {
      const body = {};
      if (name !== undefined) body.name = name;
      if (url !== undefined) body.url = url;
      if (code !== undefined) body.code = code;
      if (template_id !== undefined) body.template_id = template_id;
      if (params !== undefined) body.params = params;
      const test = await apiPatch(`/api/tests/${test_id}`, body);
      return { content: [{ type: "text", text: JSON.stringify(test, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "delete_test",
  {
    description: "Permanently delete a test and its associated schedules. IMPORTANT: Always call this first WITHOUT confirm to see what will be deleted, show that to the user, and only call again with confirm=true after the user explicitly agrees.",
    inputSchema: {
      test_id: z.coerce.number().describe("The test ID to delete (from list_tests)"),
      confirm: z.boolean().optional().describe("Set to true to actually delete. Omit or false to preview what will be deleted."),
    },
  },
  async ({ test_id, confirm }) => {
    try {
      // Always fetch test info first
      const test = await apiGet(`/api/tests/${test_id}`);
      const schedulesData = await apiGet("/api/schedules");
      const testSchedules = schedulesData.schedules.filter((s) => s.test_id === test_id);

      if (!confirm) {
        // Preview mode — show what will be deleted
        const lines = [
          `⚠ About to delete:`,
          `  Test: "${test.name}" (ID: ${test_id})`,
          `  URL: ${test.url}`,
        ];
        if (testSchedules.length) {
          lines.push(`  Schedules that will also be deleted: ${testSchedules.length}`);
          for (const s of testSchedules) {
            lines.push(`    - Schedule #${s.id} (${s.interval}, ${s.enabled ? "enabled" : "paused"})`);
          }
        } else {
          lines.push("  No associated schedules.");
        }
        lines.push("", "Ask the user to confirm, then call delete_test again with confirm=true.");
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Confirmed — delete
      const result = await apiDelete(`/api/tests/${test_id}`);
      const lines = [
        `✓ Deleted test "${result.test_name}" (ID: ${result.test_id})`,
      ];
      if (result.schedules_deleted > 0) {
        lines.push(`  Also deleted ${result.schedules_deleted} associated schedule(s).`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "run_test",
  {
    description: "Run a saved test by ID. Waits for the test to finish and returns full results with step details.",
    inputSchema: {
      test_id: z.coerce.number().describe("The test ID to run (from create_test or list_tests)"),
    },
  },
  async ({ test_id }) => {
    try {
      const { test_run_id } = await apiPost(`/api/tests/${test_id}/run`, {});
      console.error(`Started test run ${test_run_id} for test ${test_id}`);
      const testRun = await pollTestRun(test_run_id);
      const text = buildTestRunText(testRun);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "get_test_screenshots",
  {
    description: "Get screenshots from a test run. Returns only images. Use after run_test or get_test_results to view screenshots.",
    inputSchema: {
      test_run_id: z.coerce.number().describe("The test run ID (from run_test or get_test_results)"),
    },
  },
  async ({ test_run_id }) => {
    try {
      const testRun = await apiGet(`/api/test-runs/${test_run_id}`);
      if (!testRun.execution_id) {
        return { content: [{ type: "text", text: "No screenshots available for this test run." }] };
      }
      const content = await buildTestRunScreenshots(testRun);
      if (!content.length) {
        return { content: [{ type: "text", text: "No screenshots found for this test run." }] };
      }
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "schedule_test",
  {
    description: "Create a recurring schedule for a saved test. The test will run automatically at the specified interval.",
    inputSchema: {
      test_id: z.coerce.number().describe("The test ID to schedule (from create_test or list_tests)"),
      interval: z.enum(["every_minute", "hourly", "every_6_hours", "every_12_hours", "daily", "weekly"])
        .describe("How often to run the test"),
    },
  },
  async ({ test_id, interval }) => {
    try {
      const schedule = await apiPost("/api/schedules", { test_id, interval });
      const lines = [
        `Schedule created (ID: ${schedule.id})`,
        `  Test: ${schedule.test_name || schedule.test_id}`,
        `  Interval: ${schedule.interval}`,
        `  Enabled: ${schedule.enabled}`,
        `  Next run: ${schedule.next_run_at}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "list_schedules",
  {
    description: "List all test schedules for the current organization, including last run status and next run time.",
  },
  async () => {
    try {
      const data = await apiGet("/api/schedules");
      if (!data.schedules.length) {
        return { content: [{ type: "text", text: "No schedules found." }] };
      }
      const lines = [];
      for (const s of data.schedules) {
        const status = s.enabled ? "enabled" : "paused";
        const testLabel = s.test_name ? `${s.test_name} (#${s.test_id})` : `#${s.test_id}`;
        lines.push(`ID: ${s.id} | Test: ${testLabel} | ${s.interval} (${status})`);
        lines.push(`  Next run: ${s.next_run_at || "—"}`);
        if (s.last_run) {
          lines.push(`  Last run: #${s.last_run.id} — ${s.last_run.status} (${s.last_run.completed_at || "in progress"})`);
        }
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "update_schedule",
  {
    description: "Pause or resume a test schedule.",
    inputSchema: {
      schedule_id: z.coerce.number().describe("The schedule ID (from list_schedules)"),
      enabled: z.boolean().describe("true to resume, false to pause"),
    },
  },
  async ({ schedule_id, enabled }) => {
    try {
      const schedule = await apiPatch(`/api/schedules/${schedule_id}`, { enabled });
      const action = schedule.enabled ? "resumed" : "paused";
      const testLabel = schedule.test_name ? `${schedule.test_name} (#${schedule.test_id})` : `#${schedule.test_id}`;
      const lines = [`Schedule ${schedule_id} ${action} (${testLabel}).`];
      if (schedule.enabled) {
        lines.push(`  Next run: ${schedule.next_run_at}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "delete_schedule",
  {
    description: "Permanently delete a test schedule. Historical run results are preserved.",
    inputSchema: {
      schedule_id: z.coerce.number().describe("The schedule ID to delete (from list_schedules)"),
    },
  },
  async ({ schedule_id }) => {
    try {
      await apiDelete(`/api/schedules/${schedule_id}`);
      return { content: [{ type: "text", text: `Schedule ${schedule_id} deleted.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "get_test_results",
  {
    description: "Get recent test run results with step-by-step details. Use this to answer questions like 'is X working?' — filter by test_id to see the latest runs for a specific test. Shows status, timing, step pass/fail, errors, and screenshot links.",
    inputSchema: {
      test_id: z.coerce.number().optional().describe("Filter by test ID (optional — omit to see all runs)"),
      limit: z.coerce.number().optional().describe("Max results to return (default: 10)"),
    },
  },
  async ({ test_id, limit }) => {
    try {
      const params = new URLSearchParams();
      if (test_id) params.set("test_id", String(test_id));
      params.set("limit", String(limit || 10));
      const data = await apiGet(`/api/test-runs?${params}`);
      if (!data.test_runs.length) {
        return { content: [{ type: "text", text: "No test runs found." }] };
      }
      const lines = [];
      for (const run of data.test_runs) {
        lines.push(buildTestRunText(run));
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Notification channel tools ---

server.registerTool(
  "add_notification_channel",
  {
    description: "Add a notification channel to receive alerts when scheduled tests fail. Supports email, Telegram, and Slack. For Telegram, get a chat ID from https://t.me/userinfobot. For Slack, create an Incoming Webhook in your Slack workspace settings.",
    inputSchema: {
      channel_type: z.enum(["email", "telegram", "slack"]).describe("The notification channel type"),
      email_address: z.string().optional().describe("Email address for email channels (required when channel_type is email)"),
      chat_id: z.string().optional().describe("Telegram chat ID (required when channel_type is telegram). Get it from https://t.me/userinfobot."),
      webhook_url: z.string().optional().describe("Slack incoming webhook URL (required when channel_type is slack). Create one at https://api.slack.com/messaging/webhooks."),
    },
  },
  async ({ channel_type, email_address, chat_id, webhook_url }) => {
    try {
      const config = {};
      if (channel_type === "telegram") {
        if (!chat_id) return { content: [{ type: "text", text: "Error: chat_id is required for telegram channels." }], isError: true };
        config.chat_id = chat_id;
      } else if (channel_type === "email") {
        if (!email_address) return { content: [{ type: "text", text: "Error: email_address is required for email channels." }], isError: true };
        config.email_address = email_address;
      } else if (channel_type === "slack") {
        if (!webhook_url) return { content: [{ type: "text", text: "Error: webhook_url is required for slack channels." }], isError: true };
        config.webhook_url = webhook_url;
      }
      const channel = await apiPost("/api/notification-channels", {
        channel_type,
        config,
      });
      const lines = [
        `Notification channel created (ID: ${channel.id})`,
        `  Type: ${channel.channel_type}`,
      ];
      if (channel_type === "telegram") {
        lines.push(`  Chat ID: ${channel.config.chat_id}`);
      } else if (channel_type === "email") {
        lines.push(`  Email: ${channel.config.email_address}`);
      } else if (channel_type === "slack") {
        lines.push(`  Webhook: ${channel.config.webhook_url}`);
      }
      lines.push(`  Enabled: ${channel.enabled}`);
      lines.push("");
      lines.push("Sending a test notification to verify the channel works...");

      // Send test notification
      try {
        await apiPost(`/api/notification-channels/${channel.id}/test`, {});
        lines.push("✓ Test notification sent successfully!");
      } catch (testErr) {
        lines.push(`⚠ Could not send test notification: ${testErr.message}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "list_notification_channels",
  {
    description: "List all notification channels configured for the current organization.",
  },
  async () => {
    try {
      const data = await apiGet("/api/notification-channels");
      if (!data.channels.length) {
        return { content: [{ type: "text", text: "No notification channels configured. Use add_notification_channel to set one up." }] };
      }
      const lines = [];
      for (const ch of data.channels) {
        const status = ch.enabled ? "enabled" : "disabled";
        lines.push(`ID: ${ch.id} | ${ch.channel_type} (${status})`);
        if (ch.channel_type === "telegram") {
          lines.push(`  Chat ID: ${ch.config.chat_id}`);
        } else if (ch.channel_type === "email") {
          lines.push(`  Email: ${ch.config.email_address}`);
        } else if (ch.channel_type === "slack") {
          lines.push(`  Webhook: ${ch.config.webhook_url}`);
        }
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "remove_notification_channel",
  {
    description: "Remove a notification channel. Use list_notification_channels to find the channel ID.",
    inputSchema: {
      channel_id: z.coerce.number().describe("The channel ID to remove (from list_notification_channels)"),
    },
  },
  async ({ channel_id }) => {
    try {
      await apiDelete(`/api/notification-channels/${channel_id}`);
      return { content: [{ type: "text", text: `Notification channel ${channel_id} removed.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.registerTool(
  "test_notification_channel",
  {
    description: "Send a test notification to verify a channel is working correctly.",
    inputSchema: {
      channel_id: z.coerce.number().describe("The channel ID to test (from list_notification_channels)"),
    },
  },
  async ({ channel_id }) => {
    try {
      await apiPost(`/api/notification-channels/${channel_id}/test`, {});
      return { content: [{ type: "text", text: `Test notification sent to channel ${channel_id}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("AskQA MCP server running on stdio");
