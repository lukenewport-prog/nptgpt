import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { authenticate, generateToken, authMiddleware } from './auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) { 
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('Only .png, .jpg and .gif format allowed!');
      error.code = 'LIMIT_FILE_TYPES';
      return cb(error, false);
    }
    cb(null, true);
  }
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Authentication middleware
app.use(authMiddleware);

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!authenticate(username, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(username);
  
  // Set cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  res.json({ token });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Initialize Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
if (!endpoint) {
  throw new Error('AZURE_OPENAI_ENDPOINT environment variable is required');
}

// Validate required environment variables
const requiredEnvVars = {
  AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY?.trim(),
  AZURE_OPENAI_ENDPOINT: endpoint,
  AZURE_OPENAI_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim()
};

// Check for missing environment variables
Object.entries(requiredEnvVars).forEach(([name, value]) => {
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
});

// Clean the endpoint URL
const cleanEndpoint = requiredEnvVars.AZURE_OPENAI_ENDPOINT
  .replace(/^https?:\/\//, '')    // Remove protocol if present
  .replace(/\/+$/, '')            // Remove trailing slashes
  .replace(/\/openai$/, '');      // Remove /openai if present

// Construct the base URL
const baseUrl = `https://${cleanEndpoint}/openai/deployments/${requiredEnvVars.AZURE_OPENAI_DEPLOYMENT_NAME}`;

// Log the configuration for debugging
console.log('Azure OpenAI Configuration:', {
  endpoint: cleanEndpoint,
  deploymentName: requiredEnvVars.AZURE_OPENAI_DEPLOYMENT_NAME,
  baseUrl,
  hasKey: !!requiredEnvVars.AZURE_OPENAI_KEY
});

const client = new OpenAI({
  apiKey: requiredEnvVars.AZURE_OPENAI_KEY,
  baseURL: baseUrl,
  defaultQuery: { 'api-version': '2023-12-01-preview' },
  defaultHeaders: { 'api-key': requiredEnvVars.AZURE_OPENAI_KEY }
});

// Handle image upload
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  res.json({ 
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// Store conversations in memory (in a production environment, use a database)
const conversations = new Map();

app.post('/api/chat', async (req, res) => {
  try {
    const { message, imageUrl, conversationId } = req.body;
    
    // Get or create conversation history
    let messages = conversations.get(conversationId) || [
      { role: "system", content: "You are a helpful AI assistant capable of understanding both text and images." }
    ];

    // Create new message
    let newMessage;
    if (imageUrl) {
      // Read the image file and convert to base64
      const imagePath = path.join(__dirname, 'public', imageUrl);
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 
                      imageUrl.toLowerCase().endsWith('.gif') ? 'image/gif' : 
                      'image/jpeg';

      // For GPT-4O Vision API
      newMessage = {
        role: "user",
        content: [
          { type: "text", text: message || "What's in this image?" },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "high"
            }
          }
        ]
      };
    } else {
      newMessage = {
        role: "user",
        content: message
      };
    }

    // Add new message to history
    messages.push(newMessage);
    
    const response = await client.chat.completions.create({
      messages: messages,
      temperature: 0.7,
      max_tokens: 800
    });

    // Add assistant's response to history
    const assistantMessage = {
      role: "assistant",
      content: response.choices[0].message.content
    };
    messages.push(assistantMessage);

    // Store updated conversation
    if (!conversationId) {
      const newConversationId = Date.now().toString();
      conversations.set(newConversationId, messages);
      res.json({ 
        reply: assistantMessage.content,
        conversationId: newConversationId
      });
    } else {
      conversations.set(conversationId, messages);
      res.json({ 
        reply: assistantMessage.content,
        conversationId
      });
    }
  } catch (error) {
    console.error('Error:', error);
    if (error.error?.code === 'content_filter') {
      res.status(400).json({ 
        error: "This image was filtered due to Azure OpenAI's content management policy. Please try a different image.",
        details: error.error.message
      });
    } else {
      res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
