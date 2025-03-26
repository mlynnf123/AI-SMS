import Fastify from 'fastify';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fetch from 'node-fetch';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import OpenAI from 'openai';

// Load environment variables from .env file
dotenv.config();

// Environment variables
const {
  OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  OPENAI_ASSISTANT_ID
} = process.env;

// Validate required environment variables
if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);

// Constants
const PORT = process.env.PORT || 5050;
const SPREADSHEET_ID = '1mPIsiLiBo3Ij5df9szcgZZsvca4BnsweW8Y5c6OQfRQ';

// Google Sheets setup
async function getGoogleSheetsDoc() {
  const serviceAccountAuth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}

// Root Route
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Realtime API Automation Assistant is running!' });
});

// Route 1: Get first message based on call history
fastify.post('/api/get-first-message', async (request, reply) => {
  try {
    const { data1 } = request.body;
    
    // Get call history from Google Sheets
    const doc = await getGoogleSheetsDoc();
    const callHistorySheet = doc.sheetsByTitle['call_history'];
    await callHistorySheet.loadHeaderRow();
    
    // Filter rows where phone_number equals data1
    const rows = await callHistorySheet.getRows();
    const filteredRows = rows.filter(row => row.phone_number === data1);
    
    // Sort by most recent (assuming there's a timestamp column)
    filteredRows.sort((a, b) => new Date(b._rawData[4] || 0) - new Date(a._rawData[4] || 0));
    
    let name = null;
    let summary = null;
    
    if (filteredRows.length > 0) {
      name = filteredRows[0].name;
      summary = filteredRows[0].summary;
    }
    
    // Generate first message using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are to construct a first message. If the input includes a name and summary of a last interaction, your output will be 'You just picked up the phone for a custom, their name is {firstName}, their last call was about {lastCallSummary}. Introduce yourself as Sophie from Bart's Automative. Ask if they want to follow up on the last call, or spesk about a new request.' Otherwise, if the input is null, inconclusive, or missing information, your output will be 'You just picked up the phone for a custom, this is the first time the customer is calling, start with a fresh greeting. Introduce yourself as Sophie from Bart's Automative and ask what you can help them with.'"
        },
        {
          role: "user",
          content: `Name: ${name}, Summary: ${summary}`
        }
      ],
      max_tokens: 2000,
      temperature: 1
    });
    
    const firstMessage = completion.choices[0].message.content;
    
    reply.send({ firstMessage });
  } catch (error) {
    console.error('Error in get-first-message:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Route 2: Add new call summary
fastify.post('/api/add-call-summary', async (request, reply) => {
  try {
    const { data1, data2 } = request.body;
    
    // Extract name using OpenAI
    const nameCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Find and output the customer's name. Your should just be the customer's name and nothing else."
        },
        {
          role: "user",
          content: data2
        }
      ],
      max_tokens: 2000,
      temperature: 1
    });
    
    const name = nameCompletion.choices[0].message.content;
    
    // Generate summary using OpenAI
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarise the following transcript into a short 1-2 sentences. Here is an example of the output we expect: Bart called to book his car in for a service. He got a service and turbo upgrade."
        },
        {
          role: "user",
          content: data2
        }
      ],
      max_tokens: 2000,
      temperature: 1
    });
    
    const summary = summaryCompletion.choices[0].message.content;
    
    // Add to Google Sheets
    const doc = await getGoogleSheetsDoc();
    const callHistorySheet = doc.sheetsByTitle['call_history'];
    
    await callHistorySheet.addRow({
      'phone_number': data1,
      'name': name,
      'transcript': data2,
      'summary': summary
    });
    
    reply.send({ success: true });
  } catch (error) {
    console.error('Error in add-call-summary:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Route 3: Question and answer with OpenAI Assistant
fastify.post('/api/question-answer', async (request, reply) => {
  try {
    const { data1, data2 } = request.body;
    let threadId = data2;
    
    // Check if this is a new conversation or continuing an existing one
    if (!threadId || !threadId.startsWith('thread_')) {
      // Create a new thread
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
    }
    
    // Add the user's message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: data1
    });
    
    // Run the assistant on the thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: OPENAI_ASSISTANT_ID || 'asst_66Q3ruOwVM8mt660oEvWZAu0'
    });
    
    // Wait for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    
    while (runStatus.status !== 'completed') {
      if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
        throw new Error(`Run ended with status: ${runStatus.status}`);
      }
      
      // Wait for a second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }
    
    // Get the latest message from the thread
    const messages = await openai.beta.threads.messages.list(threadId);
    const latestMessage = messages.data.find(msg => msg.role === 'assistant');
    
    reply.send({
      message: latestMessage.content[0].text.value,
      thread: threadId
    });
  } catch (error) {
    console.error('Error in question-answer:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Route 4: Book a tow
fastify.post('/api/book-tow', async (request, reply) => {
  try {
    const { data1, data2 } = request.body;
    
    // Add to Google Sheets
    const doc = await getGoogleSheetsDoc();
    const bookTowSheet = doc.sheetsByTitle['book_tow'];
    
    await bookTowSheet.addRow({
      'phone_number': data1,
      'location': data2,
      'status': 'pending'
    });
    
    reply.send({
      message: "Your tow was successfully book, one of our drivers will call you shortly to confirm pick up time."
    });
  } catch (error) {
    console.error('Error in book-tow:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Route to handle incoming SMS (from your original index.js)
fastify.post('/sms', async (request, reply) => {
  const { Body: userMessage, From: userPhone } = request.body;

  try {
    // Make ChatGPT API call
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an AI receptionist for Barts Automotive. Your job is to politely engage with the client and obtain their name, availability, and service/work required. Keep responses concise as this is SMS."
        },
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const aiResponse = response.choices[0].message.content;

    // Send SMS reply using Twilio
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
      const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'To': userPhone,
          'From': TWILIO_PHONE_NUMBER,
          'Body': aiResponse
        })
      });

      if (!twilioResponse.ok) {
        throw new Error('Failed to send SMS');
      }
    }

    // Add conversation to call history
    await fetch(`http://localhost:${PORT}/api/add-call-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data1: userPhone,
        data2: `User: ${userMessage}\nAI: ${aiResponse}`
      })
    });

    reply.send({ success: true });
  } catch (error) {
    console.error('Error:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Main webhook endpoint that replaces the Make.com webhook
fastify.post('/webhook', async (request, reply) => {
  try {
    const { route, data1, data2 } = request.body;
    
    let response;
    
    switch (route) {
      case '1':
        // Get first message
        response = await fetch(`http://localhost:${PORT}/api/get-first-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data1, data2 })
        });
        break;
        
      case '2':
        // Add call summary
        response = await fetch(`http://localhost:${PORT}/api/add-call-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data1, data2 })
        });
        break;
        
      case '3':
        // Question and answer
        response = await fetch(`http://localhost:${PORT}/api/question-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data1, data2 })
        });
        break;
        
      case '4':
        // Book a tow
        response = await fetch(`http://localhost:${PORT}/api/book-tow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data1, data2 })
        });
        break;
        
      default:
        throw new Error(`Unknown route: ${route}`);
    }
    
    const responseData = await response.json();
    reply.send(responseData);
  } catch (error) {
    console.error('Error in webhook:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// Start the server
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});
