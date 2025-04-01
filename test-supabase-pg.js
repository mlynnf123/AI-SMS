import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const { SUPABASE_URL, SUPABASE_API_KEY } = process.env;

// Check if credentials are provided
if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error('Error: Missing Supabase credentials');
  console.error('Please set SUPABASE_URL and SUPABASE_API_KEY in your .env file');
  process.exit(1);
}

// Extract the project reference from the Supabase URL
// Example: https://pwnhyqobctcwomfgcfpu.supabase.co -> pwnhyqobctcwomfgcfpu
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('Error: Could not extract project reference from Supabase URL');
  console.error('Expected format: https://your-project-ref.supabase.co');
  process.exit(1);
}

// Function to test direct PostgreSQL connection
async function testDirectConnection() {
  console.log('Testing direct PostgreSQL connection...');
  console.log('Note: This requires your password, which is not in the .env file');
  console.log('You can find your password in the Supabase dashboard under Project Settings > Database');
  
  const password = process.env.SUPABASE_DB_PASSWORD || 'your-password-here';
  
  const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
  console.log(`Connection string: ${connectionString.replace(password, '********')}`);
  
  const client = new pg.Client({
    connectionString,
  });
  
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL database!');
    
    // Test a simple query
    const result = await client.query('SELECT current_timestamp');
    console.log(`Current database time: ${result.rows[0].current_timestamp}`);
    
    await client.end();
    return true;
  } catch (error) {
    console.error('Error connecting to PostgreSQL database:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.error('The password is incorrect. Please check your SUPABASE_DB_PASSWORD environment variable.');
    }
    return false;
  }
}

// Function to test pooled connection (IPv4 compatible)
async function testPooledConnection() {
  console.log('\nTesting pooled PostgreSQL connection (IPv4 compatible)...');
  console.log('Note: This requires your password, which is not in the .env file');
  
  const password = process.env.SUPABASE_DB_PASSWORD || 'your-password-here';
  
  const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  console.log(`Connection string: ${connectionString.replace(password, '********')}`);
  
  const client = new pg.Client({
    connectionString,
  });
  
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL database via pooler!');
    
    // Test a simple query
    const result = await client.query('SELECT current_timestamp');
    console.log(`Current database time: ${result.rows[0].current_timestamp}`);
    
    await client.end();
    return true;
  } catch (error) {
    console.error('Error connecting to PostgreSQL database via pooler:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.error('The password is incorrect. Please check your SUPABASE_DB_PASSWORD environment variable.');
    }
    return false;
  }
}

// Function to test Supabase API connection
async function testSupabaseAPIConnection() {
  console.log('\nTesting Supabase API connection...');
  
  try {
    // Make a request to the Supabase REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`
      }
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from Supabase API:', errorText);
      return false;
    }
    
    const data = await response.json();
    console.log('Successfully connected to Supabase API!');
    console.log('Available tables:', data);
    
    return true;
  } catch (error) {
    console.error('Error testing Supabase API connection:', error.message);
    return false;
  }
}

// Run the tests
async function runTests() {
  console.log('Supabase Connection Tests');
  console.log('========================\n');
  
  const apiSuccess = await testSupabaseAPIConnection();
  
  console.log('\nTo test direct database connections, you need to add your database password');
  console.log('to your .env file as SUPABASE_DB_PASSWORD=your-password-here');
  
  if (process.env.SUPABASE_DB_PASSWORD) {
    const directSuccess = await testDirectConnection();
    const pooledSuccess = await testPooledConnection();
    
    console.log('\nTest Summary:');
    console.log('-------------');
    console.log(`Supabase API Connection: ${apiSuccess ? 'PASSED' : 'FAILED'}`);
    console.log(`Direct PostgreSQL Connection: ${directSuccess ? 'PASSED' : 'FAILED'}`);
    console.log(`Pooled PostgreSQL Connection: ${pooledSuccess ? 'PASSED' : 'FAILED'}`);
  } else {
    console.log('\nTest Summary:');
    console.log('-------------');
    console.log(`Supabase API Connection: ${apiSuccess ? 'PASSED' : 'FAILED'}`);
    console.log('Direct PostgreSQL Connection: SKIPPED (no password provided)');
    console.log('Pooled PostgreSQL Connection: SKIPPED (no password provided)');
  }
  
  console.log('\nRecommendations:');
  console.log('---------------');
  if (!apiSuccess) {
    console.log('1. Check your SUPABASE_URL and SUPABASE_API_KEY in the .env file');
    console.log('2. Make sure your Supabase project is active');
    console.log('3. Check if your IP is allowed in Supabase settings');
  } else {
    console.log('Your Supabase API connection is working correctly!');
    console.log('For the JavaScript client, you should use:');
    console.log(`- URL: ${SUPABASE_URL}`);
    console.log(`- API Key: ${SUPABASE_API_KEY.substring(0, 5)}...${SUPABASE_API_KEY.substring(SUPABASE_API_KEY.length - 5)}`);
    console.log('\nFor direct PostgreSQL connections, you should use:');
    console.log(`- Host: db.${projectRef}.supabase.co`);
    console.log('- Port: 5432');
    console.log('- Database: postgres');
    console.log('- User: postgres');
    console.log('- Password: (from your Supabase dashboard)');
    
    console.log('\nFor pooled PostgreSQL connections (IPv4 compatible), you should use:');
    console.log(`- Host: aws-0-us-east-1.pooler.supabase.com`);
    console.log('- Port: 6543');
    console.log('- Database: postgres');
    console.log(`- User: postgres.${projectRef}`);
    console.log('- Password: (from your Supabase dashboard)');
  }
}

runTests();
