// Simple HTTP server for testing Cloud Run deployment
const http = require('http');

// Get port from environment variable
const PORT = process.env.PORT || 8080;

// Create a simple server
const server = http.createServer((req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  
  // Log all request headers for debugging
  console.log('Request headers:', req.headers);
  
  // Basic routing
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head>
          <title>Cloud Run Test Server</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            h1 { color: #333; }
            .container { max-width: 800px; margin: 0 auto; }
            .success { color: green; font-weight: bold; }
            .info { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Cloud Run Test Server</h1>
            <p class="success">✅ Server is running successfully!</p>
            <div class="info">
              <p><strong>Environment:</strong></p>
              <ul>
                <li>PORT: ${PORT}</li>
                <li>NODE_ENV: ${process.env.NODE_ENV || 'not set'}</li>
                <li>Server started at: ${new Date().toISOString()}</li>
              </ul>
            </div>
            <p>This is a simple test server to verify Cloud Run deployment.</p>
            <p>Try the <a href="/check-leads">/check-leads</a> endpoint with a POST request.</p>
          </div>
        </body>
      </html>
    `);
  } else if (req.url === '/check-leads' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      console.log('Received body:', body);
      
      try {
        // Try to parse the body as JSON
        const data = JSON.parse(body);
        console.log('Parsed data:', data);
        
        // Send a success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Test endpoint successful',
          receivedData: data,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        // Handle JSON parsing errors
        console.error('Error parsing request body:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body',
          message: error.message
        }));
      }
    });
  } else {
    // Handle 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Not Found',
      message: `The requested URL ${req.url} was not found on this server.`
    }));
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Environment variables: PORT=${PORT}`);
  console.log('Server is ready to handle requests');
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Keep the process running
});

console.log('Simple server script loaded');
