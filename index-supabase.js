import Fastify from 'fastify';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import Fastify from 'fastify';
import WebSocket from 'ws';
import fs from 'fs';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env file
dotenv.config();

// Retrieve the environment variables
const { 
    OPENAI_API_KEY, 
    TWILIO_ACCOUNT_SID, 
    TWILIO_AUTH_TOKEN, 
    TWILIO_PHONE_NUMBER,
    SUPABASE_URL,
    SUPABASE_API_KEY
} = process.env;

if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key. Please set it in the .env file.');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_API_KEY in the .env file.');
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

// Initialize Fastify
const fastify = Fastify({
    logger: true
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
const SYSTEM_MESSAGE = 'You are an AI receptionist for Barts Automotive. Your job is to politely engage with the client and obtain their name, availability, and service/work required. Ask one question at a time. Do not ask for other contact information, and do not check availability, assume we are free. Ensure the conversation remains friendly and professional, and guide the user to provide these details naturally. If necessary, ask follow-up questions to gather the required information.';
const VOICE = 'alloy';
const PORT = process.env.PORT || 5050;

// Session management
const sessions = new Map();
const connectedClients = new Map();

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

// Supabase functions
async function initializeSupabaseTables() {
    // Check if tables exist, if not create them
    try {
        // Create conversations table
        const { error: conversationsError } = await supabase.rpc('create_conversations_table_if_not_exists');
        if (conversationsError && !conversationsError.message.includes('already exists')) {
            console.error('Error creating conversations table:', conversationsError);
            
            // Fallback: Try to create table directly
            const { error: fallbackError } = await supabase.query(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    phone_number TEXT NOT NULL,
                    name TEXT,
                    thread_id TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);
            
            if (fallbackError) {
                console.error('Fallback error creating conversations table:', fallbackError);
            }
        }

        // Create messages table
        const { error: messagesError } = await supabase.rpc('create_messages_table_if_not_exists');
        if (messagesError && !messagesError.message.includes('already exists')) {
            console.error('Error creating messages table:', messagesError);
            
            // Fallback: Try to create table directly
            const { error: fallbackError } = await supabase.query(`
                CREATE TABLE IF NOT EXISTS messages (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    conversation_id UUID REFERENCES conversations(id),
                    sender TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);
            
            if (fallbackError) {
                console.error('Fallback error creating messages table:', fallbackError);
            }
        }

        console.log('Supabase tables initialized successfully');
    } catch (error) {
        console.error('Error initializing Supabase tables:', error);
    }
}

async function getOrCreateConversation(phoneNumber, name = '') {
    try {
        // Check if conversation exists
        const { data: existingConversation, error: fetchError } = await supabase
            .from('conversations')
            .select('*')
            .eq('phone_number', phoneNumber)
            .order('created_at', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error('Error fetching conversation:', fetchError);
            throw fetchError;
        }

        if (existingConversation && existingConversation.length > 0) {
            return existingConversation[0];
        }

        // Create new conversation
        const { data: newConversation, error: insertError } = await supabase
            .from('conversations')
            .insert([
                { phone_number: phoneNumber, name: name || null }
            ])
            .select();

        if (insertError) {
            console.error('Error creating conversation:', insertError);
            throw insertError;
        }

        return newConversation[0];
    } catch (error) {
        console.error('Error in getOrCreateConversation:', error);
        throw error;
    }
}

async function updateConversationThreadId(conversationId, threadId) {
    try {
        const { error } = await supabase
            .from('conversations')
            .update({ thread_id: threadId, updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        if (error) {
            console.error('Error updating conversation thread ID:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error in updateConversationThreadId:', error);
        throw error;
    }
}

async function storeMessage(conversationId, sender, content) {
    try {
        const { data, error } = await supabase
            .from('messages')
            .insert([
                { conversation_id: conversationId, sender, content }
            ])
            .select();

        if (error) {
            console.error('Error storing message:', error);
            throw error;
        }

        // Update conversation's updated_at timestamp
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        return data[0];
    } catch (error) {
        console.error('Error in storeMessage:', error);
        throw error;
    }
}

async function getConversationMessages(conversationId) {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error in getConversationMessages:', error);
        throw error;
    }
}

// WebSocket server for real-time updates
const wsServer = new WebSocket.Server({ noServer: true });

wsServer.on('connection', (socket, request) => {
    const clientId = request.url.split('?clientId=')[1];
    if (clientId) {
        connectedClients.set(clientId, socket);
        console.log(`Client ${clientId} connected`);

        socket.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log(`Received message from client ${clientId}:`, data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });

        socket.on('close', () => {
            connectedClients.delete(clientId);
            console.log(`Client ${clientId} disconnected`);
        });
    } else {
        socket.close();
    }
});

// Function to broadcast message to all connected clients
function broadcastMessage(message) {
    const messageString = JSON.stringify(message);
    connectedClients.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(messageString);
        }
    });
}

// Root Route
fastify.get('/', async (request, reply) => {
    reply.send({ message: 'SMS and Voice Assistant Server is running!' });
});

// Route to get all conversations
fastify.get('/api/conversations', async (request, reply) => {
    try {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) {
            throw error;
        }

        reply.send(data);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        reply.status(500).send({ 
            error: 'Internal server error', 
            message: error.message
        });
    }
});

// Route to get a specific conversation with messages
fastify.get('/api/conversations/:id', async (request, reply) => {
    try {
        const { id } = request.params;
        
        // Get conversation
        const { data: conversation, error: conversationError } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single();

        if (conversationError) {
            throw conversationError;
        }

        // Get messages
        const messages = await getConversationMessages(id);

        reply.send({
            ...conversation,
            messages
        });
    } catch (error) {
        console.error('Error fetching conversation:', error);
        reply.status(500).send({ 
            error: 'Internal server error', 
            message: error.message
        });
    }
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
        
        const results = [];
        
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
            
            // Get or create conversation in Supabase
            const conversation = await getOrCreateConversation(phoneNumber, name);
            
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
                            content: "You are an AI assistant for Barts Automotive. Your task is to initiate contact with potential leads. Keep the message professional, friendly, and focused on automotive services."
                        },
                        {
                            role: "user",
                            content: `Create an initial outreach message for ${name}. Mention Barts Automotive and ask about their automotive needs.`
                        }
                    ]
                })
            });

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;

            // Store AI message in Supabase
            await storeMessage(conversation.id, 'assistant', aiResponse);

            // Send SMS using Twilio
            const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    'To': phoneNumber,
                    'From': TWILIO_PHONE_NUMBER,
                    'Body': aiResponse
                })
            });

            if (!twilioResponse.ok) {
                const twilioError = await twilioResponse.json();
                throw new Error(`Failed to send SMS: ${JSON.stringify(twilioError)}`);
            }

            // Broadcast message to connected clients
            broadcastMessage({
                type: 'new_message',
                conversation_id: conversation.id,
                message: {
                    sender: 'assistant',
                    content: aiResponse,
                    created_at: new Date().toISOString()
                }
            });

            results.push({
                phoneNumber,
                name,
                message: aiResponse,
                success: true
            });
        }

        reply.send({ 
            success: true, 
            message: "Outreach messages sent",
            results
        });
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

// Constants for deduplication and rate limiting
const MESSAGE_DEDUPE_WINDOW_MS = 60000; // 1 minute deduplication window
const processedMessages = new Map(); // Track processed message IDs and timestamps
const rateLimiter = new Map(); // phone -> last message timestamp

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

// Route to handle incoming SMS - MODIFIED WITH DEDUPLICATION AND RATE LIMITING
fastify.post('/sms', async (request, reply) => {
    const { Body: userMessage, From: userPhone, MessageSid } = request.body;

    // === RATE LIMITING ===
    // Check for rate limiting
    const lastMessageTime = rateLimiter.get(userPhone) || 0;
    if (Date.now() - lastMessageTime < 1000) { // 1 second between messages
        console.log(`Rate limiting ${userPhone} - too many messages`);
        return reply.send({ success: true, message: "Message rate limited" });
    }
    rateLimiter.set(userPhone, Date.now());

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

    try {
        // Get or create conversation in Supabase
        const conversation = await getOrCreateConversation(userPhone);
        
        // Store user message in Supabase
        await storeMessage(conversation.id, 'user', userMessage);
        
        // Broadcast message to connected clients
        broadcastMessage({
            type: 'new_message',
            conversation_id: conversation.id,
            message: {
                sender: 'user',
                content: userMessage,
                created_at: new Date().toISOString(),
                MessageSid
            }
        });

        // Make ChatGPT API call
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
                        content: "You are an AI receptionist for Barts Automotive. Your job is to politely engage with the client and obtain their name, availability, and service/work required. Keep responses concise as this is SMS."
                    },
                    {
                        role: "user",
                        content: userMessage
                    }
                ]
            })
        });

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        // Store AI message in Supabase
        await storeMessage(conversation.id, 'assistant', aiResponse);

        // Send SMS reply using Twilio
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
            const twilioError = await twilioResponse.json();
            throw new Error(`Failed to send SMS: ${JSON.stringify(twilioError)}`);
        }

        // Broadcast message to connected clients
        broadcastMessage({
            type: 'new_message',
            conversation_id: conversation.id,
            message: {
                sender: 'assistant',
                content: aiResponse,
                created_at: new Date().toISOString()
            }
        });

        reply.send({ success: true });
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

// Start the server
const start = async () => {
    try {
        // Initialize Supabase tables
        await initializeSupabaseTables();
        
        // Start the server
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        
        // Set up WebSocket server
        fastify.server.on('upgrade', (request, socket, head) => {
            const { pathname } = new URL(request.url, 'http://localhost');
            
            if (pathname === '/ws') {
                wsServer.handleUpgrade(request, socket, head, (ws) => {
                    wsServer.emit('connection', ws, request);
                });
            }
        });
        
        console.log(`Server is listening on port ${PORT}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

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
        console.error('Error in makeChatGPTCompletion:', error);
        throw error;
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
                    // Create a conversation for this call
                    const phoneNumber = `call_${sessionId}`;
                    const conversation = await getOrCreateConversation(phoneNumber, parsedContent.customerName);
                    
                    // Store the transcript as a message
                    await storeMessage(conversation.id, 'system', transcript);
                    
                    // Store the extracted details as a message
                    await storeMessage(conversation.id, 'system', JSON.stringify(parsedContent));
                    
                    // Broadcast the new conversation to connected clients
                    broadcastMessage({
                        type: 'new_conversation',
                        conversation: {
                            ...conversation,
                            messages: [
                                {
                                    sender: 'system',
                                    content: transcript,
                                    created_at: new Date().toISOString()
                                },
                                {
                                    sender: 'system',
                                    content: JSON.stringify(parsedContent),
                                    created_at: new Date().toISOString()
                                }
                            ]
                        }
                    });
                    
                    console.log('Extracted and stored customer details:', parsedContent);
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

// Start the server
start();
