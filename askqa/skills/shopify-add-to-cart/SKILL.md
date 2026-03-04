---
name: shopify-add-to-cart
description: Set up automated monitoring for a Shopify store's add-to-cart flow
---

# Monitor Shopify Add to Cart

Use this skill to set up automated monitoring for a Shopify store's add-to-cart flow. When the button breaks — due to an app update, theme change, or platform rollout — AskQA catches it within minutes and sends an alert with a screenshot.

## Step 1: Get the store URL

Ask the user for their Shopify store URL (e.g. `https://my-store.myshopify.com` or their custom domain). The test works on any public Shopify storefront — no credentials or API keys are needed.

## Step 2: Create the test

Use the `create_test` MCP tool with these parameters:

- `name`: something descriptive like "Shopify add to cart"
- `url`: the store URL from Step 1
- `template_id`: `cart-visible`

This template opens a real browser, finds a product on the homepage, clicks Add to Cart, and verifies the product lands in the cart — exactly how a customer would do it.

## Step 3: Run it once to verify

Use `run_test` with the test ID returned from Step 2. Wait for the result.

If it passes: great, the test is working correctly. Proceed to Step 4.

If it fails: the most common causes on Shopify are:
- The homepage shows a banner or popup blocking the first product link — let the user know and ask if they want to try a specific product URL instead
- The store uses an unconventional theme — try passing the product page URL directly as the `url` parameter
- The add-to-cart button is genuinely broken (that's exactly what this monitor is for!)

## Step 4: Schedule hourly monitoring

Use `schedule_test` with:

- `test_id`: the ID from Step 2
- `interval`: `hourly`

Hourly is the recommended cadence for checkout monitoring — it catches breakage within 60 minutes, well before most customers notice.

## Step 5: Set up alerts (optional but recommended)

Ask the user how they want to be notified when the test fails. Options:

- **Email**: use `add_notification_channel` with `channel_type: email`
- **Slack**: use the `/setup-slack` skill first, then link the channel
- **Skip**: they can always check results manually with `get_test_results`

## Step 6: Confirm

After setup, confirm:

- The test is saved and has a passing run
- A schedule is active (use `list_schedules` to show them)
- Alerts are configured if they chose that option

Let the user know: AskQA will now run this test every hour. If add-to-cart ever breaks, they'll get a notification with a screenshot of exactly where it failed.
