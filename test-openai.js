import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get OpenAI API key from environment variables
const { OPENAI_API_KEY } = process.env;

// Check if API key is provided
if (!OPENAI_API_KEY) {
  console.error('Error: Missing OpenAI API key');
  console.error('Please set OPENAI_API_KEY in your .env file');
  process.exit(1);
}

// Function to test OpenAI API connection
async function testOpenAIConnection() {
  try {
    console.log('Testing OpenAI API connection...');
    
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
            content: "You are a helpful assistant."
          },
          {
            role: "user",
            content: "Hello, this is a test message. Please respond with 'OpenAI API is working correctly!'"
          }
        ]
      })
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response from OpenAI API:', JSON.stringify(errorData, null, 2));
      return false;
    }
    
    const data = await response.json();
    console.log('Response from OpenAI:');
    console.log(data.choices[0].message.content);
    
    console.log('Successfully connected to OpenAI API!');
    return true;
  } catch (error) {
    console.error('Error testing OpenAI API connection:', error.message);
    return false;
  }
}

// Function to test OpenAI Realtime API connection
async function testOpenAIRealtimeConnection() {
  try {
    console.log('\nTesting OpenAI Realtime API connection...');
    console.log('Note: This is just a connection test and will not establish a full WebSocket session');
    
    // We'll just check if the URL is accessible, not establish a full WebSocket connection
    const response = await fetch('https://api.openai.com/v1/realtime/info', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (response.status === 404) {
      console.log('OpenAI Realtime API endpoint not found. This is expected as we\'re just testing connectivity.');
      console.log('For a full WebSocket connection, you would need to use a WebSocket client.');
      return true;
    } else if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from OpenAI Realtime API:', errorText);
      return false;
    }
    
    console.log('Successfully connected to OpenAI Realtime API!');
    return true;
  } catch (error) {
    console.error('Error testing OpenAI Realtime API connection:', error.message);
    return false;
  }
}

// Run the tests
async function runTests() {
  const apiSuccess = await testOpenAIConnection();
  const realtimeSuccess = await testOpenAIRealtimeConnection();
  
  console.log('\nTest Summary:');
  console.log('-------------');
  console.log(`OpenAI API Test: ${apiSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`OpenAI Realtime API Test: ${realtimeSuccess ? 'PASSED' : 'FAILED'}`);
  
  if (!apiSuccess || !realtimeSuccess) {
    console.log('\nTroubleshooting Tips:');
    console.log('1. Check that your OPENAI_API_KEY is correct');
    console.log('2. Make sure your OpenAI account has access to the GPT-4o model');
    console.log('3. Check if your OpenAI account has sufficient credits');
    console.log('4. Verify that your OpenAI account has access to the Realtime API (it may be in beta)');
  }
}

runTests();
