# Integrated API Automation Server

This project combines the functionality of a Make.com blueprint with a Node.js server, allowing you to run everything from a single codebase without needing to set up the Make.com blueprint separately.

## Features

- **SMS Handling**: Receives and processes SMS messages using Twilio
- **OpenAI Integration**: Uses GPT models for generating responses and processing conversations
- **Google Sheets Integration**: Stores call history and tow booking information
- **Webhook Endpoint**: Replaces the Make.com webhook functionality

## Routes

The server implements the following routes that match the Make.com blueprint functionality:

1. **GET /** - Root route that confirms the server is running
2. **POST /api/get-first-message** - Gets the first message based on call history
3. **POST /api/add-call-summary** - Adds a new call summary to Google Sheets
4. **POST /api/question-answer** - Handles question and answer functionality using OpenAI Assistant
5. **POST /api/book-tow** - Books a tow service
6. **POST /sms** - Handles incoming SMS messages
7. **POST /webhook** - Main webhook endpoint that replaces the Make.com webhook

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Cloud account with Google Sheets API enabled
- OpenAI API key
- Twilio account (for SMS functionality)

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on the `.env.example` template:
   ```
   cp .env.example .env
   ```
4. Fill in your environment variables in the `.env` file:
   - OpenAI API key
   - Twilio credentials
   - Google service account details
   - OpenAI Assistant ID (optional, defaults to the one in the Make.com blueprint)

### Google Sheets Setup

1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a service account and download the JSON key
4. Share your Google Sheet with the service account email
5. Make sure your Google Sheet has the following sheets:
   - `call_history` with columns: phone_number, name, transcript, summary
   - `book_tow` with columns: phone_number, location, status

### Running the Server

Development mode:
```
npm run dev
```

Production mode:
```
npm start
```

## Usage

### Webhook Endpoint

The main webhook endpoint is `/webhook` which accepts POST requests with the following parameters:

- `route`: The route number (1-4) corresponding to the Make.com blueprint routes
- `data1`: Usually the phone number
- `data2`: Additional data (varies by route)

Example request:
```json
{
  "route": "1",
  "data1": "+1234567890",
  "data2": "additional data"
}
```

### SMS Endpoint

The SMS endpoint is `/sms` which accepts POST requests with Twilio's standard format:

- `Body`: The message body
- `From`: The sender's phone number

## Migrating from Make.com

This server completely replaces the Make.com blueprint functionality. If you were previously using the Make.com blueprint, you can simply:

1. Update any external services that were calling your Make.com webhook to call your server's `/webhook` endpoint instead
2. Ensure your Google Sheets structure matches what the server expects

No other changes should be needed as the server implements all the same functionality.
