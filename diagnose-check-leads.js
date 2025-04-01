import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// URL of your server
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5050';
// URL to test
const TEST_URL = process.env.TEST_URL || 'https://openai-realtime-api-voice-assistant-meranda1.replit.app/check-leads';

// Test data
const testData = {
  leads: [
    {
      phoneNumber: "1234567890",
      name: "Test User"
    }
  ]
};

// Function to test the local check-leads endpoint
async function testLocalCheckLeads() {
  try {
    console.log('Testing local /check-leads endpoint...');
    console.log(`URL: ${SERVER_URL}/check-leads`);
    console.log('Request data:', JSON.stringify(testData, null, 2));
    
    const response = await fetch(`${SERVER_URL}/check-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    return {
      success: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    console.error('Error testing local endpoint:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to test the remote check-leads endpoint
async function testRemoteCheckLeads() {
  try {
    console.log('\nTesting remote /check-leads endpoint...');
    console.log(`URL: ${TEST_URL}`);
    console.log('Request data:', JSON.stringify(testData, null, 2));
    
    const response = await fetch(TEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    let data;
    try {
      data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
    } catch (e) {
      const text = await response.text();
      console.log('Response text:', text);
      data = { text };
    }
    
    return {
      success: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    console.error('Error testing remote endpoint:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to diagnose the issue
async function diagnoseIssue(localResult, remoteResult) {
  console.log('\n--- Diagnostic Results ---');
  
  // Check if both endpoints failed
  if (!localResult.success && !remoteResult.success) {
    console.log('Both local and remote endpoints failed.');
    
    // Check for connection issues
    if (localResult.error && localResult.error.includes('ECONNREFUSED')) {
      console.log('Local server is not running. Start it with: npm run start:supabase');
    }
    
    if (remoteResult.error && remoteResult.error.includes('ENOTFOUND')) {
      console.log('Remote server URL is invalid or not accessible.');
    }
    
    // Check for common error patterns
    const errorMessages = [
      { pattern: 'OPENAI_API_KEY', message: 'OpenAI API key is missing or invalid.' },
      { pattern: 'TWILIO', message: 'Twilio credentials are missing or invalid.' },
      { pattern: 'SUPABASE', message: 'Supabase credentials are missing or invalid.' },
      { pattern: 'Internal Server Error', message: 'Server encountered an internal error.' }
    ];
    
    for (const { pattern, message } of errorMessages) {
      if ((localResult.data && JSON.stringify(localResult.data).includes(pattern)) || 
          (remoteResult.data && JSON.stringify(remoteResult.data).includes(pattern))) {
        console.log(`Possible issue: ${message}`);
      }
    }
  } 
  // Check if only remote endpoint failed
  else if (localResult.success && !remoteResult.success) {
    console.log('Local endpoint works but remote endpoint fails.');
    console.log('This suggests an environment-specific issue on the remote server.');
    
    if (remoteResult.status === 500) {
      console.log('The remote server is returning a 500 Internal Server Error.');
      console.log('Possible causes:');
      console.log('1. Missing or invalid environment variables on the remote server');
      console.log('2. Database connection issues on the remote server');
      console.log('3. Permissions or rate limiting issues with external APIs');
    }
  }
  // Check if only local endpoint failed
  else if (!localResult.success && remoteResult.success) {
    console.log('Remote endpoint works but local endpoint fails.');
    console.log('This suggests an issue with your local environment or configuration.');
  }
  // Both endpoints work
  else {
    console.log('Both endpoints are working correctly!');
  }
  
  // Provide specific recommendations
  console.log('\n--- Recommendations ---');
  
  if (!localResult.success || !remoteResult.success) {
    console.log('1. Check your environment variables (.env file)');
    console.log('2. Run the individual test scripts:');
    console.log('   - node test-openai.js');
    console.log('   - node test-twilio.js');
    console.log('   - node test-supabase.js');
    console.log('3. Check server logs for more detailed error messages');
    console.log('4. Verify that all required services (OpenAI, Twilio, Supabase) are accessible');
    
    if (remoteResult.status === 500) {
      console.log('5. For the remote server 500 error:');
      console.log('   - Check if the server has all required environment variables');
      console.log('   - Verify the server has the correct dependencies installed');
      console.log('   - Look at the server logs for detailed error information');
    }
  }
}

// Run the tests
async function runDiagnostics() {
  console.log('Starting diagnostics for /check-leads endpoint...');
  console.log('=================================================\n');
  
  const localResult = await testLocalCheckLeads();
  const remoteResult = await testRemoteCheckLeads();
  
  await diagnoseIssue(localResult, remoteResult);
}

runDiagnostics();
