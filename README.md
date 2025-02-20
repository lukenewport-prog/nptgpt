# NptGPT

A web application that uses Azure OpenAI's GPT-4 model for chat and image analysis.

## Features

- Chat interface similar to ChatGPT
- Support for image uploads and analysis
- Real-time responses from Azure OpenAI GPT-4
- Docker containerization
- Responsive design

## Setup

1. Clone the repository
2. Create a `.env` file with your Azure OpenAI credentials:
   ```
   AZURE_OPENAI_KEY=your_key_here
   AZURE_OPENAI_ENDPOINT=your_endpoint.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
   ```

3. Run with Docker:
   ```bash
   docker-compose up --build
   ```

The application will be available at http://localhost:3000

## Development

- Built with Node.js and Express
- Uses vanilla JavaScript for frontend
- Containerized with Docker
- Environment variables for configuration
- Support for image uploads with preview
