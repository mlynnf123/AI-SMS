# Make.com Scenario Setup Guide with Supabase Integration

This guide will help you set up a Make.com scenario that uses Supabase to interact with your application's `/check-leads` endpoint. This integration allows you to store leads in Supabase, process them through your AI system, and track the results.

## Supabase Setup

Before setting up the Make.com scenario, you need to prepare your Supabase database:

### 1. Create Required Tables in Supabase

#### Leads Table
This table will store new leads that need to be processed:

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  status TEXT DEFAULT 'new'
);
```

#### Processed Leads Table
This table will store the results of successfully processed leads:

```sql
CREATE TABLE processed_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'success',
  response JSONB
);
```

#### Error Logs Table
This table will store information about failed processing attempts:

```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  name TEXT,
  phone_number TEXT,
  error_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  request_body TEXT,
  error_response TEXT,
  status_code TEXT
);
```

### 2. Set Up Supabase Policies

Ensure your Supabase tables have the appropriate RLS (Row Level Security) policies:

```sql
-- Allow Make.com to read from the leads table
CREATE POLICY "Allow Make.com to read leads" ON leads
  FOR SELECT USING (true);

-- Allow Make.com to insert into processed_leads
CREATE POLICY "Allow Make.com to insert processed_leads" ON processed_leads
  FOR INSERT WITH CHECK (true);

-- Allow Make.com to insert into error_logs
CREATE POLICY "Allow Make.com to insert error_logs" ON error_logs
  FOR INSERT WITH CHECK (true);
```

## Make.com Scenario Setup

### Overview

This scenario will:
1. Trigger when a new lead is added to your Supabase leads table
2. Format the lead data
3. Send it to your `/check-leads` endpoint
4. Store the results back in Supabase

### Step-by-Step Setup

#### 1. Create a New Scenario

1. Log in to Make.com
2. Click "Create a new scenario"
3. Name it "Process New Leads - Supabase"

#### 2. Add the Supabase Trigger Module

- Module: **Supabase > Watch Records**
- Connection: Create a new Supabase connection
  - Connection Name: Your Supabase Project
  - API URL: Your Supabase URL (e.g., https://yourproject.supabase.co)
  - API Key: Your Supabase API key (use the service_role key for full access)
- Table: "leads"
- Watch Type: "New Records"
- Max Results: 10 (adjust as needed)

#### 3. Add a Data Formatter

- Module: **Flow Control > Set Variable**
- Variable Name: "formattedLeads"
- Value:
```
[
  {
    "phoneNumber": "{{1.phone_number}}",
    "name": "{{1.name}}"
  }
]
```

#### 4. Add HTTP Request Module

This module connects to your application:

- Module: **HTTP > Make a request**
- URL: Your application's check-leads endpoint (e.g., `https://your-cloud-run-url.run.app/check-leads`)
- Method: POST
- Headers:
  - Name: "Content-Type"
  - Value: "application/json"
- Body Type: Raw
- Request Content:
```json
{
  "leads": {{formattedLeads}}
}
```
- Parse response: Yes

#### 5. Add Error Handling

- Module: **Flow Control > Router**
- Create two routes:
  - Route 1: If the HTTP request was successful
    - Condition: `{{3.statusCode}} = 200`
  - Route 2: If the HTTP request failed
    - Condition: `{{3.statusCode}} != 200`

#### 6. Success Route

Add a module to store successful results:

- Module: **Supabase > Insert Record**
- Connection: Your Supabase connection
- Table: "processed_leads"
- Record:
  - lead_id: `{{1.id}}`
  - name: `{{1.name}}`
  - phone_number: `{{1.phone_number}}`
  - processed_at: `{{now}}`
  - status: "success"
  - response: `{{3.body}}`

#### 7. Error Route

Add modules to handle errors:

- Module: **Supabase > Insert Record**
- Connection: Your Supabase connection
- Table: "error_logs"
- Record:
  - lead_id: `{{1.id}}`
  - name: `{{1.name}}`
  - phone_number: `{{1.phone_number}}`
  - error_time: `{{now}}`
  - request_body: `{{2.value}}`
  - error_response: `{{3.body}}`
  - status_code: `{{3.statusCode}}`

- Module: **Tools > Send an Email** (optional)
  - To: Your email
  - Subject: "Error Processing Lead"
  - Content: "Error processing lead for {{1.name}}. Error: {{3.body}}"

### Fixing the 500 Internal Server Error

If you're still experiencing a 500 Internal Server Error with the `/check-leads` endpoint, here's how to diagnose it using Make.com:

1. Add a **Flow Control > Set Variable** module before the HTTP request
   - Variable Name: "requestBody"
   - Value: The JSON you're sending to the endpoint

2. Add a **Tools > Send an Email** module in the error route
   - Include both the request body and the full error response:
   ```
   Request Body:
   {{requestBody}}

   Error Response:
   {{4.body}}
   ```

3. Check the error details to identify the specific issue

## Scenario 2: Handling Inbound SMS

You already have a Make.com scenario for handling inbound SMS (in your make1http file). Here's how to ensure it works correctly with your Cloud Run deployment:

### Update the Webhook URL

1. In your existing inbound SMS scenario, locate the webhook that receives SMS notifications from Twilio
2. Update the webhook URL to point to your Cloud Run deployment
3. Ensure the webhook is properly configured to handle the format Twilio sends

### Test the Webhook

1. Send a test SMS to your Twilio number
2. Check the Make.com execution history to verify the webhook received the SMS
3. Verify that the data is being properly sent to your application

## Troubleshooting

### Common Issues with the HTTP Module

1. **500 Internal Server Error**
   - Check all required environment variables in your Cloud Run deployment
   - Verify Supabase connection is working
   - Check OpenAI API key permissions and quota

2. **Connection Refused**
   - Verify the URL is correct
   - Ensure your Cloud Run service is running
   - Check that unauthenticated invocations are allowed

3. **Invalid JSON Format**
   - Double-check the JSON structure in your HTTP request
   - Ensure all required fields are included
   - Validate the JSON using a JSON validator

### Debugging Tips

1. Use the **Tools > Log** module to log values at different stages
2. Add a **Flow Control > Iterator** module to process multiple leads one by one
3. Use the **HTTP > Get Response Status** module to get more details about HTTP errors

## Complete Example JSON for HTTP Request

Here's a complete example of the JSON you should send to the `/check-leads` endpoint:

```json
{
  "leads": [
    {
      "phoneNumber": "+15551234567",
      "name": "John Doe"
    },
    {
      "phoneNumber": "+15557654321",
      "name": "Jane Smith"
    }
  ]
}
```

Make sure the phone numbers are properly formatted with the country code.
