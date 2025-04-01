import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Twilio credentials from environment variables
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

// Check if credentials are provided
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.error('Error: Missing Twilio credentials');
  console.error('Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your .env file');
  process.exit(1);
}

// Function to test Twilio API connection
async function testTwilioConnection() {
  try {
    console.log('Testing Twilio API connection...');
    
    // Try to get account information to test the connection
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`
      }
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from Twilio API:', errorText);
      return false;
    }
    
    const data = await response.json();
    console.log('Account Information:');
    console.log(`- Account SID: ${data.sid}`);
    console.log(`- Account Name: ${data.friendly_name}`);
    console.log(`- Account Status: ${data.status}`);
    
    console.log('Successfully connected to Twilio API!');
    return true;
  } catch (error) {
    console.error('Error testing Twilio API connection:', error.message);
    return false;
  }
}

// Function to test Twilio phone number
async function testTwilioPhoneNumber() {
  try {
    console.log('\nTesting Twilio phone number...');
    
    // Format phone number for Twilio (ensure it starts with +)
    let phoneNumber = TWILIO_PHONE_NUMBER;
    if (phoneNumber && !phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber.replace(/\D/g, '');
    }
    
    // Try to get phone number information
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`
      }
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from Twilio API:', errorText);
      return false;
    }
    
    const data = await response.json();
    
    if (data.incoming_phone_numbers.length === 0) {
      console.error(`Phone number ${phoneNumber} not found in your Twilio account`);
      return false;
    }
    
    const phoneInfo = data.incoming_phone_numbers[0];
    console.log('Phone Number Information:');
    console.log(`- Phone Number: ${phoneInfo.phone_number}`);
    console.log(`- Friendly Name: ${phoneInfo.friendly_name}`);
    console.log(`- SMS URL: ${phoneInfo.sms_url || 'Not configured'}`);
    console.log(`- Voice URL: ${phoneInfo.voice_url || 'Not configured'}`);
    
    console.log('Successfully verified Twilio phone number!');
    return true;
  } catch (error) {
    console.error('Error testing Twilio phone number:', error.message);
    return false;
  }
}

// Run the tests
async function runTests() {
  const connectionSuccess = await testTwilioConnection();
  let phoneNumberSuccess = false;
  
  if (connectionSuccess) {
    phoneNumberSuccess = await testTwilioPhoneNumber();
  }
  
  console.log('\nTest Summary:');
  console.log('-------------');
  console.log(`Twilio API Connection Test: ${connectionSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Twilio Phone Number Test: ${phoneNumberSuccess ? 'PASSED' : 'FAILED'}`);
  
  if (!connectionSuccess || !phoneNumberSuccess) {
    console.log('\nTroubleshooting Tips:');
    console.log('1. Check that your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct');
    console.log('2. Make sure your Twilio account is active and not in trial mode');
    console.log('3. Verify that the phone number exists in your Twilio account');
    console.log('4. Check if your Twilio account has sufficient credits');
  }
}

runTests();
