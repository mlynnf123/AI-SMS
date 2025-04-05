// Test script for SMS functionality
const fetch = require('node-fetch');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5050';
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '+15127295813'; // Replace with your Twilio number

// Function to simulate an incoming SMS
async function simulateIncomingSMS(from, body) {
  // Generate a random MessageSid for testing deduplication
  const messageSid = `SM${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  console.log(`\nSimulating incoming SMS from ${from}: "${body}" (MessageSid: ${messageSid})`);
  
  try {
    const response = await fetch(`${SERVER_URL}/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        From: from,
        Body: body,
        MessageSid: messageSid
      })
    });
    
    const data = await response.json();
    console.log('Server response:', data);
    
    if (response.ok) {
      console.log('✅ SMS forwarded successfully');
    } else {
      console.log('❌ Error forwarding SMS:', data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error sending request:', error.message);
  }
}

// Function to test the server status
async function checkServerStatus() {
  try {
    console.log(`\nChecking server status at ${SERVER_URL}...`);
    const response = await fetch(SERVER_URL);
    const data = await response.json();
    
    console.log('Server status:', response.status);
    console.log('Server response:', data);
    
    if (response.ok) {
      console.log('✅ Server is running');
      return true;
    } else {
      console.log('❌ Server returned an error');
      return false;
    }
  } catch (error) {
    console.error('❌ Server is not reachable:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('=== SMS Functionality Test ===');
  
  // Check if server is running
  const serverRunning = await checkServerStatus();
  if (!serverRunning) {
    console.log('\n⚠️ Server is not running. Please start the server and try again.');
    rl.close();
    return;
  }
  
  // Interactive testing
  rl.question('\nEnter a phone number to test (e.g., +1234567890): ', (phoneNumber) => {
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber.replace(/\D/g, '');
      console.log(`Formatted phone number: ${phoneNumber}`);
    }
    
    testSMS(phoneNumber);
  });
}

// Function to handle SMS testing
function testSMS(phoneNumber) {
  rl.question('\nEnter a message to send: ', async (message) => {
    await simulateIncomingSMS(phoneNumber, message);
    
    rl.question('\nDo you want to send another message? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        testSMS(phoneNumber);
      } else {
        console.log('\n=== Test Complete ===');
        console.log('Remember to check the server logs for more details.');
        console.log(`Also check your Make.com scenario executions to verify the webhook received the data.`);
        rl.close();
      }
    });
  });
}

// Run the tests
runTests();
