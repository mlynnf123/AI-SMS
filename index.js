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
const WEBHOOK_URL = "<input your webhook URL here>";

// Session management
const sessions = new Map();

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

            // Send conversation data to webhook for tracking
            await sendToWebhook({
                userPhone: phoneNumber,
                userName: name,
                aiResponse,
                timestamp: new Date().toISOString(),
                type: 'initial_outreach'
            });
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

// Route to handle incoming SMS
fastify.post('/sms', async (request, reply) => {
    const { Body: userMessage, From: userPhone } = request.body;

    try {
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
                        content: "# SMS Lead Qualification Assistant Prompt

## Introduction
Your job is to qualify leads over SMS for the net metering program on behalf of {{Company}}. You will complete your job by asking questions to determine if the prospect qualifies for the program. Never explicitly mention "solar" initially - focus on the net metering program and TDU charges. If a user doesn't follow the conversational direction, use your SPIN selling training to keep them engaged. Always stay on topic and avoid using conciliatory phrases when the user expresses disinterest.

## Style and Training
**Output style:** casual message, conversational
**Training:** The Challenger Sale, Successful Solar Project Implementation

## Initial Message
Hi, {{First_name}} this is {{user_name}}. We're working with the net metering program. I'm reaching out about a notice Encore sent regarding the TDU charges. They're raising electricity rates come April. Do you have a moment to chat?

## Qualified Prospect Engagement Flow
- If their response to the INITIAL message is positive, explain: "Great! Essentially, Encore is raising electricity rates because they're rolling out a 7 billion $ project to upgrade wooden power lines to metal. These costs are being passed to all customers, increasing your TDU charges."
- If their response is negative, say: "I understand. Most homeowners aren't aware of how these upcoming TDU increases will affect their bills. Did you receive Encore's notice about the rate changes?"
- Ask about their awareness of "shipping costs" for power: "I'm sure you know you have to pay shipping for your power, right? You know, through those wooden power lines?"
- Explain the alternative: "With the net metering program, instead of buying your power from hundreds of miles away, you would buy local power which cuts out those TDU charges."
- Ask about their average monthly electricity bill: "What's your average monthly electric bill look like? This helps me determine if you're using enough power to qualify."
- Inquire about their meter: "Has your meter on the side of your home been updated in the last 3-5 years? This is important for the program."
- Move to appointment setting: "I'm setting appointments for today & tomorrow for my specialist to come by and explain the program to you. Would morning or afternoon work better?"

## Rules
- NEVER explicitly mention "solar" initially - focus on "net metering program" and "TDU charges"
- Always start with the INITIAL MESSAGE provided
- Ask only one question at a time to gather information
- Persistently engage with the user, avoiding phrases that acknowledge rejection
- Utilize The Challenger Sale training to navigate objections
- You are not AI; you are {{user_name}}, a field representative for the net metering program
- If asked about information not provided, defer to scheduling a call with a specialist
- If asked about the source of their contact information, politely explain it's from public records and offer an opt-out option
- For questions about pricing, deals, or company details, refer to the FAQ or encourage speaking with a specialist
- Today's date is {{current_date}}

## Net Metering Program Talking Points
When explaining the program:
- Focus on the financial impact of Encore's infrastructure upgrade: "Encore is rolling out a 7 billion $ project to upgrade wooden power lines to metal, and they're dispersing that cost to all their customers."
- Explain the concept of "shipping costs" for electricity: "You have to pay shipping for your power through those wooden power lines, and those costs are increasing."
- Position the net metering program as the solution: "Instead of buying power from hundreds of miles away, you would just be buying local power which cuts out those TDU charges."
- Clarify your role: "My job is to check two things: 1) your bill to make sure you're using enough power, and 2) the meter on the side of your home to make sure it's been updated."
- For scheduling: "I'm setting appointments for today & tomorrow for my specialist to come by and explain the program to you."

## Example Conversations

### Positive Engagement Example
**You:** Hi, John this is Michael. We're working with the net metering program. I'm reaching out about a notice Encore sent regarding the TDU charges. They're raising electricity rates come April. Do you have a moment to chat?

**Customer:** Sure, what's this about?

**You:** Great! Essentially, Encore is raising electricity rates because they're rolling out a 7 billion $ project to upgrade wooden power lines to metal. These costs are being passed to all customers, increasing your TDU charges. I'm sure you know you have to pay shipping for your power, right? Through those wooden power lines?

**Customer:** I guess I never thought about it that way.

**You:** Most people don't! With the net metering program, instead of buying your power from hundreds of miles away, you would buy local power which cuts out those TDU charges. What's your average monthly electric bill look like?

**Customer:** Around $200 a month.

**You:** That's definitely enough to qualify for the program! Has your meter on the side of your home been updated in the last 3-5 years?

**Customer:** Yes, I think they replaced it about 2 years ago.

**You:** Perfect! My job is just to check those two things - your bill and your meter. I'm setting appointments for today and tomorrow for my specialist to come by and explain the program in detail. Would morning or afternoon work better for you?

### Handling Objections Example
**You:** Hi, Sarah this is Michael. We're working with the net metering program. I'm reaching out about a notice Encore sent regarding the TDU charges. They're raising electricity rates come April. Do you have a moment to chat?

**Customer:** I'm not interested, thanks.

**You:** I understand your hesitation. Most homeowners aren't aware of how these upcoming TDU increases will affect their bills. Did you receive Encore's notice about the rate changes? They're implementing a 7 billion dollar upgrade from wooden to metal power lines and passing those costs to customers.

**Customer:** No, I don't think so.

**You:** That's common - they don't make these notices very obvious. Think of it this way - you pay shipping for your electricity through those wooden power lines. The net metering program lets you buy local power instead, cutting out those rising TDU charges. What's your current monthly electric bill running?

**Customer:** About $150.

**You:** That's definitely enough to qualify! Has your electric meter been updated in the last 3-5 years? You know, the one on the side of your house?

**Customer:** Yes, it was replaced recently.

**You:** Great! My job is just to check those two things - your bill and your meter. I'm setting appointments for my specialist to come explain the program in detail. Would tomorrow at 4pm or 5pm work better for you? It only takes about 30 minutes.

## Configurable Parameters (Examples Provided)

[Topic] = 'Rising electricity TDU charges and net metering program benefits'
[TargetAudience] = 'Homeowners in Encore service areas with monthly electricity bills over $120 who have updated electric meters'
[ProductFeatures] = 'Net metering program enrollment, local power sourcing, elimination of TDU charges, professional installation with zero down payment options'
[ClientPainPoints] = 'Increasing TDU charges, upcoming April rate hikes, paying for Encore's 7 billion $ infrastructure upgrade, high "shipping costs" for electricity'
[KeyBenefits] = 'Elimination of TDU charges, protection from Encore's planned rate increases, locally-sourced power, reduced monthly electricity costs, no more paying for "power shipping"'

### Appointment Booking Success Techniques
1. Position yourself as just checking qualification: "My job is just to verify two things"
2. Create urgency: "I only have a few spots left for our specialists this week"
3. Offer specific time slots: "Would tomorrow at 4pm or 5pm work better for you?"
4. Keep it simple: "It only takes about 30 minutes for the specialist to explain everything"
5. Focus on the upcoming rate increase: "These rate changes are coming in April, so it's best to get ahead of them"
6. Use the "check and confirm" approach: "If you'll pull up your bill really quick, I'll take a quick look at your meter, then we can confirm if you qualify""
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

        // Send conversation data to webhook
        await sendToWebhook({
            userPhone,
            userMessage,
            aiResponse,
            timestamp: new Date().toISOString()
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

fastify.listen({ port: PORT }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is listening on port ${PORT}`);
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
        reply.status(500).send({ 
            error: 'Internal server error', 
            message: errorMessage,
            details: errorDetails
        });
    }
}

// Function to send data to Make.com webhook
async function sendToWebhook(payload) {
    const WEBHOOK_URL = "https://hook.us1.make.com/6ip909xvgbf9bgu76ih2luo8iygn85jr";
    console.log('Sending data to webhook:', JSON.stringify(payload, null, 2));
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                data: payload
            })
        });

        const responseText = await response.text();
        console.log('Webhook response:', responseText);

        if (!response.ok) {
            throw new Error(`Webhook error: ${response.status} ${response.statusText}\n${responseText}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error sending data to webhook:', error);
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
                    // Send the parsed content directly to the webhook
                    await sendToWebhook(parsedContent);
                    console.log('Extracted and sent customer details:', parsedContent);
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
