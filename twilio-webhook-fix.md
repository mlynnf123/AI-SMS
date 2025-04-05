# Fix for Duplicate Messages Issue

After analyzing your code and configuration, I've identified the cause of the duplicate messages:

## The Problem: Multiple Webhook Destinations

Your system is sending the same SMS data to **two different Make.com webhooks**:

1. In your index.js file, there's a default webhook URL:
   ```javascript
   const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://hook.us1.make.com/kepedzwftagnlr8d3cdc2ic88h3774sb";
   ```

2. In your .env file, there's a different webhook URL:
   ```
   WEBHOOK_URL=https://hook.us1.make.com/kepedzwftagnlr8d3cdc2ic88h3774sb
   ```

This means that when your server receives an SMS, it forwards it to the webhook URL in your .env file. But there's likely another scenario using the default webhook URL that's also processing the same messages.

## Solution: Consolidate to One Webhook

1. **Check your Make.com scenarios**:
   - Log into Make.com
   - Look for all scenarios that have webhook triggers
   - Identify which one is the correct/current one you want to use
   - Disable or delete any duplicate scenarios

2. **Update your Twilio configuration**:
   - Log into your Twilio account
   - Go to Phone Numbers > Manage > Active Numbers
   - Click on your SMS number (+15127295813)
   - Under "Messaging", check the webhook configuration
   - Make sure it's only pointing to ONE endpoint (your server's `/sms` endpoint)
   - Remove any additional webhook configurations

3. **Verify your server configuration**:
   - Make sure your server is only forwarding to one Make.com webhook
   - Remove the default webhook URL from your code to avoid confusion:

   ```javascript
   // Change this:
   const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://hook.us1.make.com/kepedzwftagnlr8d3cdc2ic88h3774sb";
   
   // To this:
   const WEBHOOK_URL = process.env.WEBHOOK_URL;
   if (!WEBHOOK_URL) {
     console.error('Missing WEBHOOK_URL in environment variables');
     process.exit(1);
   }
   ```

## Implementation Steps

1. **Update your index.js file**:
   ```javascript
   // Replace this line:
   const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://hook.us1.make.com/6ip909xvgbf9bgu76ih2luo8iygn85jr";
   
   // With this:
   const WEBHOOK_URL = process.env.WEBHOOK_URL;
   if (!WEBHOOK_URL) {
     console.error('Missing WEBHOOK_URL in environment variables');
     process.exit(1);
   }
   ```

2. **Check Make.com scenarios**:
   - Log into Make.com
   - Go to Scenarios
   - Look for scenarios with webhook triggers
   - Disable any duplicate scenarios
   - Make sure only one scenario is processing your SMS messages

3. **Check Twilio configuration**:
   - Verify that your Twilio phone number is only sending webhooks to your server
   - Make sure there are no additional webhook configurations

4. **Test the fix**:
   - Deploy the updated code
   - Send a test SMS to your Twilio number
   - Verify that you only receive one response

## Additional Debugging

If you're still seeing duplicate messages after implementing these changes:

1. Add more detailed logging to your server:
   ```javascript
   console.log('Webhook URL being used:', WEBHOOK_URL);
   ```

2. Check if there are multiple instances of your server running:
   ```bash
   ps aux | grep node
   ```

3. Check your Twilio logs to see where messages are being sent:
   - Log into your Twilio account
   - Go to Monitor > Logs > Message Logs
   - Look for your test message and check the webhook destinations
