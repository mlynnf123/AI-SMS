import { createClient } from '@supabase/supabase-js';
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

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

// Function to test Supabase connection
async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // Try to get the current user to test the connection
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Error connecting to Supabase:', error.message);
      return false;
    }
    
    console.log('Successfully connected to Supabase!');
    return true;
  } catch (error) {
    console.error('Error testing Supabase connection:', error.message);
    return false;
  }
}

// Function to test creating tables
async function testCreateTables() {
  try {
    console.log('Testing table creation...');
    
    // Try to create a test table
    const { error } = await supabase.rpc('create_conversations_table_if_not_exists');
    
    if (error && !error.message.includes('already exists')) {
      console.error('Error creating tables:', error.message);
      
      // Try direct SQL as fallback
      console.log('Trying direct SQL as fallback...');
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
        console.error('Fallback error creating tables:', fallbackError.message);
        return false;
      }
    }
    
    console.log('Table creation test completed successfully!');
    return true;
  } catch (error) {
    console.error('Error testing table creation:', error.message);
    return false;
  }
}

// Run the tests
async function runTests() {
  const connectionSuccess = await testSupabaseConnection();
  
  if (connectionSuccess) {
    await testCreateTables();
  }
  
  console.log('\nTest Summary:');
  console.log('-------------');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Connection Test: ${connectionSuccess ? 'PASSED' : 'FAILED'}`);
  
  if (!connectionSuccess) {
    console.log('\nTroubleshooting Tips:');
    console.log('1. Check that your SUPABASE_URL and SUPABASE_API_KEY are correct');
    console.log('2. Make sure your Supabase project is active');
    console.log('3. Check if your IP is allowed in Supabase settings');
  }
}

runTests();
