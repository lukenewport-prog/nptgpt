 import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import dotenv from 'dotenv';

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
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, imageUrl } = req.body;
    let messages = [
      { role: "system", content: "You are a helpful AI assistant capable of understanding both text and images." }
    ];

    if (imageUrl) {
      // Read the image file and convert to base64
      const imagePath = path.join(__dirname, 'public', imageUrl);
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 
                      imageUrl.toLowerCase().endsWith('.gif') ? 'image/gif' : 
                      'image/jpeg';

      // For GPT-4O Vision API
      messages.push({
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
      });
    } else {
      messages.push({
        role: "user",
        content: message
      });
    }
    
    const response = await client.chat.completions.create({
      messages: messages,
      temperature: 0.7,
      max_tokens: 800
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
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
