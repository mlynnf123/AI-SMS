# AI SMS Conversation System

A Node.js server that handles SMS conversations using OpenAI and Twilio, with optional Make.com integration.

## Features

- Direct SMS conversation handling with OpenAI
- Make.com webhook integration for advanced workflows
- Voice call handling with OpenAI's real-time API
- Google Cloud Run deployment support

## Prerequisites

- Node.js 18 or higher
- OpenAI API key
- Twilio account with SMS capabilities
- (Optional) Make.com account for advanced workflows
- (Optional) Google Cloud Platform account for deployment

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/mlynnf123/AI-SMS.git
   cd AI-SMS
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

4. Fill in your API keys and credentials in the `.env` file.

## Usage

### Local Development

Start the server:
```
node index.js
```

The server will run on port 5050 by default.

### SMS Handling Modes

The system supports two modes of operation:

1. **Direct Handling (Default)**: The server processes SMS messages directly using OpenAI and sends responses via Twilio.
   - Set `USE_MAKE_WEBHOOK=false` in your `.env` file

2. **Make.com Integration**: The server forwards SMS messages to your Make.com webhook for processing.
   - Set `USE_MAKE_WEBHOOK=true` in your `.env` file
   - Configure your Make.com scenario according to the blueprint

## Deployment to Google Cloud Run

### Option 1: Manual Deployment

1. Build the Docker image:
   ```
   docker build -t gcr.io/your-project-id/ai-sms .
   ```

2. Push the image to Google Container Registry:
   ```
   docker push gcr.io/your-project-id/ai-sms
   ```

3. Deploy to Cloud Run:
   ```
   gcloud run deploy ai-sms --image gcr.io/your-project-id/ai-sms --platform managed --region us-central1 --allow-unauthenticated
   ```

4. Set environment variables in the Cloud Run console:
   - Go to Cloud Run > Select your service > Edit & Deploy New Revision
   - Expand "Container, Networking, Security" section
   - Add each environment variable under "Environment variables"

### Option 2: Automated Deployment with Cloud Build

1. Connect your GitHub repository to Google Cloud Build
2. Configure the Cloud Build trigger to use the `cloudbuild.yaml` file
3. Set up the following substitution variables in your Cloud Build trigger:
   - _OPENAI_API_KEY
   - _TWILIO_ACCOUNT_SID
   - _TWILIO_AUTH_TOKEN
   - _TWILIO_PHONE_NUMBER
   - _OPENAI_ASSISTANT_ID (optional)
   - _WEBHOOK_URL
   - _USE_MAKE_WEBHOOK

4. Commit and push to trigger the deployment

## Make.com Integration

When using Make.com integration (`USE_MAKE_WEBHOOK=true`):
- The server forwards SMS messages to your Make.com webhook
- Your Make.com scenario handles the conversation flow
- Supabase operations are handled by the Make.com scenario

## License

MIT
