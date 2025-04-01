import fetch from 'node-fetch';

// URL of your server
const SERVER_URL = 'http://localhost:5050'; // Change this if your server is running on a different port or URL

// Test data
const testData = {
  leads: [
    {
      phoneNumber: "1234567890", // Test phone number
      name: "Test User"
    }
  ]
};

// Function to test the check-leads endpoint
async function testCheckLeads() {
  try {
    console.log('Sending test request to /check-leads endpoint...');
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
    
    if (!response.ok) {
      console.error('Error: Request failed');
    } else {
      console.log('Success: Request completed successfully');
    }
  } catch (error) {
    console.error('Error making request:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Make sure your server is running at', SERVER_URL);
    }
  }
}

// Run the test
testCheckLeads();
