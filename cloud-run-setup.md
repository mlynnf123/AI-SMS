# Deploying to Google Cloud Run

This guide will help you deploy your application to Google Cloud Run using the Dockerfile approach.

## Prerequisites

1. A Google Cloud account with billing enabled
2. Google Cloud CLI installed (optional, but helpful for troubleshooting)
3. Your code pushed to a GitHub repository

## Setup Steps

### 1. Create a Dockerfile

A Dockerfile has been created in your project root. This file tells Google Cloud Run how to build and run your application.

### 2. Set Up Environment Variables

Your application requires several environment variables to function properly. In Google Cloud Run, you'll need to set these up as part of your service configuration:

- `OPENAI_API_KEY`: Your OpenAI API key
- `TWILIO_ACCOUNT_SID`: Your Twilio account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio auth token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number
- `SUPABASE_URL`: Your Supabase URL
- `SUPABASE_API_KEY`: Your Supabase API key
- `PORT`: This will be set automatically by Cloud Run, but your application is configured to use it

### 3. Deploy to Google Cloud Run

1. Go to the Google Cloud Console: https://console.cloud.google.com/
2. Navigate to Cloud Run
3. Click "Create Service"
4. Choose "Continuously deploy from a repository"
5. Connect your GitHub repository
6. Configure the build:
   - Select "Dockerfile" as the build type
   - Leave the Dockerfile path as `/Dockerfile`
   - For "Function target" field: Leave this blank since your application is a web server, not a serverless function
     (This field is only used when deploying Cloud Functions or when your code exports a specific function to be invoked)
7. Configure the service:
   - Set a service name (e.g., "openai-realtime-api")
   - Choose a region
   - Set memory allocation (start with 512 MiB)
   - Set CPU allocation (start with 1 CPU)
   - Set concurrency (start with 80)
   - Set timeout (start with 300 seconds)
8. Set environment variables:
   - Add all the required environment variables listed above
9. Set ingress control:
   - Choose "Allow all traffic" or "Allow internal traffic and traffic from Cloud Load Balancing"
10. Set authentication:
    - Choose "Allow unauthenticated invocations" if you want your API to be publicly accessible
11. Click "Create"

### 4. Fixing the 500 Internal Server Error

If you're experiencing a 500 Internal Server Error with the `/check-leads` endpoint, here are some troubleshooting steps:

1. Check the Cloud Run logs for detailed error messages
2. Verify all environment variables are correctly set
3. Make sure your Supabase tables are properly set up
4. Check if your OpenAI API key has sufficient quota and permissions
5. Ensure your Twilio credentials are correct and the phone number is properly formatted

### 5. Monitoring and Troubleshooting

- View logs: In the Cloud Run service details, click on the "Logs" tab
- Check error reporting: Navigate to Error Reporting in Google Cloud Console
- Monitor performance: Use Cloud Monitoring to track your service's performance

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Deploying Node.js to Cloud Run](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service)
- [Managing Environment Variables in Cloud Run](https://cloud.google.com/run/docs/configuring/environment-variables)
