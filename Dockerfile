FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy only the necessary files for the simple server
COPY simple-server.js ./

# No need for dependencies as we're using built-in Node.js modules

# Expose the port the app runs on
ENV PORT=8080
EXPOSE 8080

# Add startup script to handle potential errors
RUN echo '#!/bin/bash\necho "Starting simple test server..."\nnode simple-server.js 2>&1 | tee /app/server.log' > /app/start.sh && \
    chmod +x /app/start.sh

# Command to run the application
CMD ["/app/start.sh"]
