# Bart's Automotive SMS and Voice Assistant

This project provides a complete solution to manage customer interactions through SMS, voice calls, and a web dashboard. It uses OpenAI's GPT-4o and Realtime API for natural language processing, Twilio for SMS and voice call handling, and Supabase for data storage.

## Features

- **SMS Interaction**: Automated SMS conversations with customers using OpenAI's GPT-4o
- **Voice Call Handling**: Interactive voice assistant using OpenAI's Realtime API
- **Lead Management**: Automated outreach to new leads
- **Web Dashboard**: Real-time dashboard to view and manage all conversations
- **Data Storage**: All conversations and customer information stored in Supabase

## Prerequisites

- Node.js (v18 or higher)
- OpenAI API key
- Twilio account with phone number
- Supabase account and project

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd openai-realtime-api-voice-assistant
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` template:
   ```
   cp .env.example .env
   ```

4. Fill in your API keys and credentials in the `.env` file:
   ```
   # OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key_here

   # Twilio Credentials
   TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
   TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
   TWILIO_PHONE_NUMBER=your_twilio_phone_number_here

   # Supabase Credentials
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_API_KEY=your_supabase_api_key_here

   # Server Port (optional, defaults to 5050)
   PORT=5050
   ```

## Usage

### Starting the Server

To start the server with Supabase integration:

```
npm run start:supabase
```

For development with auto-restart on file changes:

```
npm run dev:supabase
```

### Accessing the Dashboard

Once the server is running, you can access the web dashboard at:

```
http://localhost:5050
```

### Setting Up Twilio

1. In your Twilio account, set up your phone number with the following webhook URLs:

   - For SMS:
     - When a message comes in: `http://your-server-url/sms` (HTTP POST)

   - For Voice:
     - A call comes in: `http://your-server-url/incoming-call` (HTTP POST)

2. Make sure your server is accessible from the internet (you may need to use a service like ngrok for local development).

### Sending Messages to Leads

To send messages to new leads, make a POST request to:

```
POST /check-leads
```

With the following JSON body:

```json
{
  "leads": [
    {
      "phoneNumber": "+1234567890",
      "name": "John Doe"
    },
    {
      "phoneNumber": "+0987654321",
      "name": "Jane Smith"
    }
  ]
}
```

## API Endpoints

- `GET /`: Redirects to the dashboard
- `GET /api/conversations`: Get all conversations
- `GET /api/conversations/:id`: Get a specific conversation with messages
- `POST /api/conversations/:id/messages`: Send a message to a conversation
- `POST /check-leads`: Send messages to new leads
- `POST /sms`: Webhook for incoming SMS messages
- `POST /incoming-call`: Webhook for incoming voice calls

## WebSocket

The server provides a WebSocket endpoint at `/ws` for real-time updates. The dashboard automatically connects to this endpoint to receive updates about new messages and conversations.

## Project Structure

- `index-supabase-fixed.js`: Main server file with Supabase integration
- `public/`: Frontend files for the dashboard
  - `index.html`: Dashboard HTML
  - `styles.css`: Dashboard styles
  - `app.js`: Dashboard JavaScript
- `.env`: Environment variables (not included in repository)
- `.env.example`: Example environment variables file

## License

ISC
