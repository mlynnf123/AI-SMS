import postgres from 'postgres';
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

// Function to test direct PostgreSQL connection using postgres package
async function testDirectConnection() {
  console.log('Testing direct PostgreSQL connection with postgres package...');
  console.log('Note: This requires your password, which is not in the .env file');
  console.log('You can find your password in the Supabase dashboard under Project Settings > Database');
  
  const password = process.env.SUPABASE_DB_PASSWORD || 'your-password-here';
  
  const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
  console.log(`Connection string: ${connectionString.replace(password, '********')}`);
  
  let sql;
  try {
    sql = postgres(connectionString, {
      ssl: 'require',
      max: 1, // Use only one connection for testing
    });
    
    // Test a simple query
    const result = await sql`SELECT current_timestamp`;
    console.log('Successfully connected to PostgreSQL database!');
    console.log(`Current database time: ${result[0].current_timestamp}`);
    
    return true;
  } catch (error) {
    console.error('Error connecting to PostgreSQL database:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.error('The password is incorrect. Please check your SUPABASE_DB_PASSWORD environment variable.');
    }
    return false;
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}

// Function to test pooled connection (IPv4 compatible) using postgres package
async function testPooledConnection() {
  console.log('\nTesting pooled PostgreSQL connection (IPv4 compatible) with postgres package...');
  console.log('Note: This requires your password, which is not in the .env file');
  
  const password = process.env.SUPABASE_DB_PASSWORD || 'your-password-here';
  
  const connectionString = `postgresql://postgres.${projectRef}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  console.log(`Connection string: ${connectionString.replace(password, '********')}`);
  
  let sql;
  try {
    sql = postgres(connectionString, {
      ssl: 'require',
      max: 1, // Use only one connection for testing
    });
    
    // Test a simple query
    const result = await sql`SELECT current_timestamp`;
    console.log('Successfully connected to PostgreSQL database via pooler!');
    console.log(`Current database time: ${result[0].current_timestamp}`);
    
    return true;
  } catch (error) {
    console.error('Error connecting to PostgreSQL database via pooler:', error.message);
    if (error.message.includes('password authentication failed')) {
      console.error('The password is incorrect. Please check your SUPABASE_DB_PASSWORD environment variable.');
    }
    return false;
  } finally {
    if (sql) {
      await sql.end();
    }
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

// Function to test Supabase JavaScript client
async function testSupabaseJSClient() {
  console.log('\nTesting Supabase JavaScript client...');
  
  try {
    // Import the createClient function dynamically
    const { createClient } = await import('@supabase/supabase-js');
    
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);
    
    // Try to list the tables in the database
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .limit(1);
    
    if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
      console.error('Error connecting to Supabase:', error.message);
      
      // Try a different approach - check if we can at least connect to the auth API
      const { data: authData, error: authError } = await supabase.auth.getSession();
      
      if (authError) {
        console.error('Error connecting to Supabase Auth API:', authError.message);
        return false;
      }
      
      console.log('Successfully connected to Supabase Auth API!');
      return true;
    }
    
    console.log('Successfully connected to Supabase using JavaScript client!');
    if (data) {
      console.log('Found conversations table with data:', data.length > 0 ? 'Yes' : 'No (empty table)');
    }
    
    return true;
  } catch (error) {
    console.error('Error testing Supabase JavaScript client:', error.message);
    return false;
  }
}

// Run the tests
async function runTests() {
  console.log('Supabase Connection Tests');
  console.log('========================\n');
  
  const apiSuccess = await testSupabaseAPIConnection();
  const jsClientSuccess = await testSupabaseJSClient();
  
  console.log('\nTo test direct database connections, you need to add your database password');
  console.log('to your .env file as SUPABASE_DB_PASSWORD=your-password-here');
  
  let directSuccess = false;
  let pooledSuccess = false;
  
  if (process.env.SUPABASE_DB_PASSWORD) {
    directSuccess = await testDirectConnection();
    pooledSuccess = await testPooledConnection();
  }
  
  console.log('\nTest Summary:');
  console.log('-------------');
  console.log(`Supabase API Connection: ${apiSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`Supabase JavaScript Client: ${jsClientSuccess ? 'PASSED' : 'FAILED'}`);
  
  if (process.env.SUPABASE_DB_PASSWORD) {
    console.log(`Direct PostgreSQL Connection: ${directSuccess ? 'PASSED' : 'FAILED'}`);
    console.log(`Pooled PostgreSQL Connection: ${pooledSuccess ? 'PASSED' : 'FAILED'}`);
  } else {
    console.log('Direct PostgreSQL Connection: SKIPPED (no password provided)');
    console.log('Pooled PostgreSQL Connection: SKIPPED (no password provided)');
  }
  
  console.log('\nRecommendations:');
  console.log('---------------');
  if (!apiSuccess && !jsClientSuccess) {
    console.log('1. Check your SUPABASE_URL and SUPABASE_API_KEY in the .env file');
    console.log('2. Make sure your Supabase project is active');
    console.log('3. Check if your IP is allowed in Supabase settings');
  } else if (!jsClientSuccess && apiSuccess) {
    console.log('Your Supabase API connection is working, but the JavaScript client is not.');
    console.log('This might be due to:');
    console.log('1. An issue with the @supabase/supabase-js package');
    console.log('2. Incompatible versions of the package and your Supabase project');
    console.log('Try updating the @supabase/supabase-js package to the latest version:');
    console.log('npm install @supabase/supabase-js@latest');
  } else {
    console.log('Your Supabase connections are working correctly!');
    
    if (jsClientSuccess) {
      console.log('\nFor the JavaScript client, you should use:');
      console.log(`- URL: ${SUPABASE_URL}`);
      console.log(`- API Key: ${SUPABASE_API_KEY.substring(0, 5)}...${SUPABASE_API_KEY.substring(SUPABASE_API_KEY.length - 5)}`);
      console.log('\nExample code:');
      console.log('```javascript');
      console.log('import { createClient } from \'@supabase/supabase-js\'');
      console.log(`const supabase = createClient('${SUPABASE_URL}', '${SUPABASE_API_KEY.substring(0, 5)}...${SUPABASE_API_KEY.substring(SUPABASE_API_KEY.length - 5)}')`);
      console.log('```');
    }
    
    if (process.env.SUPABASE_DB_PASSWORD) {
      if (directSuccess) {
        console.log('\nFor direct PostgreSQL connections with postgres package, you should use:');
        console.log('```javascript');
        console.log('import postgres from \'postgres\'');
        console.log(`const sql = postgres('postgresql://postgres:PASSWORD@db.${projectRef}.supabase.co:5432/postgres', {`);
        console.log('  ssl: \'require\'');
        console.log('})');
        console.log('```');
      }
      
      if (pooledSuccess) {
        console.log('\nFor pooled PostgreSQL connections (IPv4 compatible) with postgres package, you should use:');
        console.log('```javascript');
        console.log('import postgres from \'postgres\'');
        console.log(`const sql = postgres('postgresql://postgres.${projectRef}:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres', {`);
        console.log('  ssl: \'require\'');
        console.log('})');
        console.log('```');
      }
    }
  }
}

runTests();
