import Fastify from 'fastify';
import WebSocket from 'ws';
import fs from 'fs';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

// Retrieve the environment variables
const { OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key. Please set it in the .env file.');
    process.exit(1);
}

// Initialize Fastify
const fastify = Fastify({
    logger: true,
    // Set request timeout to 5 seconds to avoid long-running requests
    connectionTimeout: 5000,
    // Set keep-alive timeout to 5 seconds
    keepAliveTimeout: 5000
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
        const json = JSON.parse(body);
        done(null, json);
    } catch (err) {
        done(err, undefined);
    }
});

// Add CORS headers
fastify.addHook('onRequest', (request, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    done();
});

// Constants
const SYSTEM_MESSAGE = 'You are an AI-powered SMS Lead Qualification Assistant. Your job is to engage potential leads, qualify them based on key criteria, and guide them toward booking a meeting. Your responses should feel natural, engaging, and conversational—mimicking human texting behavior';
const VOICE = 'Professional, enthusiastic';
// Cloud Run sets PORT=8080 by default
const PORT = process.env.PORT || 8080;
// Add deduplication and rate limiting
const MESSAGE_DEDUPE_WINDOW_MS = 60000; // 1 minute deduplication window
const processedMessages = new Map(); // Track processed message IDs and timestamps
const rateLimiter = new Map(); // phone -> last message timestamp
// Get webhook URL from environment variables
// This allows the webhook URL to be changed easily in the .env file
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://hook.us1.make.com/6ip909xvgbf9bgu76ih2luo8iygn85jr";
if (!WEBHOOK_URL) {
  console.error('Missing WEBHOOK_URL in environment variables');
  process.exit(1);
}
console.log('Using webhook URL:', WEBHOOK_URL);

// Session management
const sessions = new Map();

// SMS conversation history management
const smsConversations = new Map();

// List of Event Types to log to the console
const LOG_EVENT_TYPES = [
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'response.text.done',
    'conversation.item.input_audio_transcription.completed'
];

// Root Route
fastify.get('/', async (request, reply) => {
    reply.send({ message: 'SMS and Voice Assistant Server is running!' });
});

// Route to check and message new leads
fastify.post('/check-leads', async (request, reply) => {
    try {
        if (!request.body) {
            throw new Error('Request body is missing');
        }
        
        const { leads } = request.body;
        if (!leads || !Array.isArray(leads)) {
            throw new Error('Invalid leads data format');
        }
        
        for (const lead of leads) {
            let phoneNumber = lead.phoneNumber;
            const name = lead.name || '';
            
            // Format phone number for Twilio (ensure it starts with +)
            if (phoneNumber && !phoneNumber.startsWith('+')) {
                phoneNumber = '+' + phoneNumber.replace(/\D/g, '');
            }
            
            // Skip invalid phone numbers
            if (!phoneNumber || phoneNumber.length < 10) {
                console.warn(`Skipping invalid phone number: ${phoneNumber}`);
                continue;
            }
            
            // Make ChatGPT API call for initial outreach
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: SYSTEM_MESSAGE
                        },
                        {
                            role: "user",
                            content: `Create an initial outreach message for ${name}. If the lead expresses interest, ask qualifying questions one at a time.

If the lead is hesitant, address objections using The Challenger Sale approach.

Never overwhelm the lead with too much information at once.

If the lead asks unrelated questions, politely steer them back to the topic.

If the lead is not a good fit, respectfully end the conversation.`
                        }
                    ]
                })
            });

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;

            // Initialize conversation history for this lead
            if (!smsConversations.has(phoneNumber)) {
                smsConversations.set(phoneNumber, []);
            }
            
            // Add the AI's initial message to the conversation history
            const conversationHistory = smsConversations.get(phoneNumber);
            conversationHistory.push({
                role: 'system',
                content: SYSTEM_MESSAGE
            });
            conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });

            console.log(`Initialized conversation for ${phoneNumber}, sending initial message`);

            // Send conversation data to webhook for tracking
            try {
                await sendToWebhook({
                    userPhone: phoneNumber,
                    userName: name,
                    aiResponse,
                    timestamp: new Date().toISOString(),
                    type: 'initial_outreach',
                    direction: 'outbound'
                });
            } catch (webhookError) {
                console.error('Webhook error (non-fatal):', webhookError.message);
                // Continue processing - don't let webhook errors stop the flow
            }
        }

        reply.send({ success: true, message: "Outreach messages sent" });
    } catch (error) {
        console.error('Error:', error);
        // Provide more detailed error information
        const errorMessage = error.message || 'Unknown error';
        const errorDetails = error.response?.data || {};
        reply.status(500).send({ 
            error: 'Internal server error', 
            message: errorMessage,
            details: errorDetails
        });
    }
});

// Route to handle Twilio message status callbacks
fastify.post('/message-status', async (request, reply) => {
  const { MessageSid, MessageStatus, To, From } = request.body;
  
  console.log(`Message ${MessageSid} to ${To} from ${From} has status: ${MessageStatus}`);
  
  // Send an immediate acknowledgment response
  reply.send({ success: true, message: "Status received" });
  
  try {
    // Forward the status to Make.com webhook
    await sendToWebhook({
      userPhone: To,
      MessageSid,
      MessageStatus,
      To,
      From,
      timestamp: new Date().toISOString(),
      direction: 'status_update',
      type: 'message_status'
    });
  } catch (webhookError) {
    console.error('Webhook error (non-fatal):', webhookError.message);
    // Continue processing - don't let webhook errors stop the flow
  }
});

// Route to handle incoming SMS - MODIFIED WITH DEDUPLICATION AND RATE LIMITING
fastify.post('/sms', async (request, reply) => {
    const { Body, From, MessageSid } = request.body;

    // === RATE LIMITING ===
    // Check for rate limiting
    const lastMessageTime = rateLimiter.get(From) || 0;
    if (Date.now() - lastMessageTime < 1000) { // 1 second between messages
        console.log(`Rate limiting ${From} - too many messages`);
        return reply.send({ success: true, message: "Message rate limited" });
    }
    rateLimiter.set(From, Date.now());

    // === DEDUPLICATION LOGIC ===
    // Check for duplicate messages
    if (MessageSid && processedMessages.has(MessageSid)) {
        console.log(`Duplicate message ${MessageSid} detected, ignoring`);
        return reply.send({ success: true, message: "Duplicate message ignored" });
    }

    // Add message to processed set with timestamp
    if (MessageSid) {
        processedMessages.set(MessageSid, Date.now());
    }

    // Send an immediate acknowledgment response
    reply.send({ success: true, message: "SMS received, processing" });

    try {
        console.log('Received SMS:', { Body, From, MessageSid });
        
        // Get or initialize conversation history
        if (!smsConversations.has(From)) {
            smsConversations.set(From, [
                { role: 'system', content: SYSTEM_MESSAGE }
            ]);
        }
        
        const conversationHistory = smsConversations.get(From);
        
        // Add the user's message to the conversation history
        conversationHistory.push({
            role: 'user',
            content: Body
        });
        
        // Forward the SMS data to Make.com webhook
        try {
            await sendToWebhook({
                userPhone: From,
                Body,
                From,
                MessageSid,
                timestamp: new Date().toISOString(),
                direction: 'inbound',
                type: 'user_response'
            });
        } catch (webhookError) {
            console.error('Webhook error (non-fatal):', webhookError.message);
            // Continue processing - don't let webhook errors stop the flow
        }
        
        // Make ChatGPT API call for response
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: conversationHistory
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const aiResponse = data.choices[0].message.content;
            
            // Add AI response to history
            conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });
            
            // Send to webhook for Make.com to handle
            try {
                await sendToWebhook({
                    userPhone: From,
                    aiResponse: aiResponse,
                    Body: aiResponse,
                    From: TWILIO_PHONE_NUMBER,
                    To: From,
                    timestamp: new Date().toISOString(),
                    direction: 'outbound',
                    type: 'ai_response'
                });
            } catch (webhookError) {
                console.error('Webhook error (non-fatal):', webhookError.message);
                // Continue processing - don't let webhook errors stop the flow
            }
        } else {
            console.error('Unexpected response structure from OpenAI API');
        }
    } catch (error) {
        console.error(`Error handling SMS ${MessageSid || 'unknown'}:`, error);
        // Don't throw the error to prevent interrupting the flow
    }
});

// Route for Twilio to handle incoming and outgoing calls
fastify.all('/incoming-call', async (request, reply) => {
    console.log('Incoming call');

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                              <Say>Hi, you have called Bart's Automative Centre. How can we help?</Say>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

    reply.type('text/xml').send(twimlResponse);
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('Client connected');

        const sessionId = req.headers['x-twilio-call-sid'] || `session_${Date.now()}`;
        let session = sessions.get(sessionId) || { transcript: '', streamSid: null };
        sessions.set(sessionId, session);

        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        const sendSessionUpdate = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: VOICE,
                    instructions: SYSTEM_MESSAGE,
                    modalities: ["text", "audio"],
                    temperature: 0.8,
                    input_audio_transcription: {
                        "model": "whisper-1"
                    }
                }
            };

            console.log('Sending session update:', JSON.stringify(sessionUpdate));
            openAiWs.send(JSON.stringify(sessionUpdate));
        };

        // Open event for OpenAI WebSocket
        openAiWs.on('open', () => {
            console.log('Connected to the OpenAI Realtime API');
            setTimeout(sendSessionUpdate, 250);
        });

        // Listen for messages from the OpenAI WebSocket
        openAiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data);

                if (LOG_EVENT_TYPES.includes(response.type)) {
                    console.log(`Received event: ${response.type}`, response);
                }

                // User message transcription handling
                if (response.type === 'conversation.item.input_audio_transcription.completed') {
                    const userMessage = response.transcript.trim();
                    session.transcript += `User: ${userMessage}\n`;
                    console.log(`User (${sessionId}): ${userMessage}`);
                }

                // Agent message handling
                if (response.type === 'response.done') {
                    const agentMessage = response.response.output[0]?.content?.find(content => content.transcript)?.transcript || 'Agent message not found';
                    session.transcript += `Agent: ${agentMessage}\n`;
                    console.log(`Agent (${sessionId}): ${agentMessage}`);
                }

                if (response.type === 'session.updated') {
                    console.log('Session updated successfully:', response);
                }

                if (response.type === 'response.audio.delta' && response.delta) {
                    const audioDelta = {
                        event: 'media',
                        streamSid: session.streamSid,
                        media: { payload: Buffer.from(response.delta, 'base64').toString('base64') }
                    };
                    connection.send(JSON.stringify(audioDelta));
                }
            } catch (error) {
                console.error('Error processing OpenAI message:', error, 'Raw message:', data);
            }
        });

        // Handle incoming messages from Twilio
        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case 'media':
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload
                            };

                            openAiWs.send(JSON.stringify(audioAppend));
                        }
                        break;
                    case 'start':
                        session.streamSid = data.start.streamSid;
                        console.log('Incoming stream has started', session.streamSid);
                        break;
                    default:
                        console.log('Received non-media event:', data.event);
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error, 'Message:', message);
            }
        });

        // Handle connection close and log transcript
        connection.on('close', async () => {
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
            console.log(`Client disconnected (${sessionId}).`);
            console.log('Full Transcript:');
            console.log(session.transcript);

            await processTranscriptAndSend(session.transcript, sessionId);

            // Clean up the session
            sessions.delete(sessionId);
        });

        // Handle WebSocket close and errors
        openAiWs.on('close', () => {
            console.log('Disconnected from the OpenAI Realtime API');
        });

        openAiWs.on('error', (error) => {
            console.error('Error in the OpenAI WebSocket:', error);
        });
    });
});

// Periodically clean up old message IDs from the deduplication map
setInterval(() => {
    const now = Date.now();
    const threshold = now - MESSAGE_DEDUPE_WINDOW_MS;
    
    for (const [messageId, timestamp] of processedMessages.entries()) {
        if (timestamp < threshold) {
            processedMessages.delete(messageId);
        }
    }
    
    console.log(`Deduplication cleanup: ${processedMessages.size} messages being tracked`);
}, 30000); // Run every 30 seconds

fastify.listen({ 
    port: PORT,
    host: '0.0.0.0' // Listen on all network interfaces, required for Cloud Run
}, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is listening on port ${PORT} and host 0.0.0.0`);
});

// Function to make ChatGPT API completion call with structured outputs
async function makeChatGPTCompletion(transcript) {
    console.log('Starting ChatGPT API call...');
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-4o-2024-08-06",
                messages: [
                    { "role": "system", "content": "Extract customer details: name, availability, and any special notes from the transcript." },
                    { "role": "user", "content": transcript }
                ],
                response_format: {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "customer_details_extraction",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "customerName": { "type": "string" },
                                "customerAvailability": { "type": "string" },
                                "specialNotes": { "type": "string" }
                            },
                            "required": ["customerName", "customerAvailability", "specialNotes"]
                        }
                    }
                }
            })
        });

        console.log('ChatGPT API response status:', response.status);
        const data = await response.json();
        console.log('Full ChatGPT API response:', JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('Error:', error);
        // Provide more detailed error information
        const errorMessage = error.message || 'Unknown error';
        const errorDetails = error.response?.data || {};
        return { error: errorMessage, details: errorDetails };
    }
}

// Function to send data to Make.com webhook
async function sendToWebhook(payload) {
    if (!WEBHOOK_URL) {
        console.warn('Webhook URL not configured, skipping webhook call');
        return;
    }

    console.log('Sending data to webhook:', JSON.stringify(payload, null, 2));
    try {
        // Set a timeout for the webhook request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Wrap payload in data object to match Make.com expectations
            body: JSON.stringify({
                data: payload
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();
        console.log('Webhook response:', responseText);

        if (!response.ok) {
            throw new Error(`Webhook error: ${response.status} ${response.statusText}\n${responseText}`);
        }

        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Webhook request timed out after 5 seconds');
        } else {
            console.error('Error sending data to webhook:', error);
        }
        throw error; // Rethrow the error to allow the calling function to handle it
    }
}

// Main function to extract and send customer details
async function processTranscriptAndSend(transcript, sessionId = null) {
    console.log(`Starting transcript processing for session ${sessionId}...`);
    try {
        // Make the ChatGPT completion call
        const result = await makeChatGPTCompletion(transcript);

        console.log('Raw result from ChatGPT:', JSON.stringify(result, null, 2));

        if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
            try {
                const parsedContent = JSON.parse(result.choices[0].message.content);
                console.log('Parsed content:', JSON.stringify(parsedContent, null, 2));

                if (parsedContent) {
                    // Send the parsed content directly to the webhook
                    try {
                        await sendToWebhook({
                            ...parsedContent,
                            direction: 'outbound',
                            type: 'transcript_analysis'
                        });
                        console.log('Extracted and sent customer details:', parsedContent);
                    } catch (webhookError) {
                        console.error('Webhook error (non-fatal):', webhookError.message);
                        // Continue processing - don't let webhook errors stop the flow
                    }
                } else {
                    console.error('Unexpected JSON structure in ChatGPT response');
                }
            } catch (parseError) {
                console.error('Error parsing JSON from ChatGPT response:', parseError);
            }
        } else {
            console.error('Unexpected response structure from ChatGPT API');
        }

    } catch (error) {
        console.error('Error in processTranscriptAndSend:', error);
    }
}
