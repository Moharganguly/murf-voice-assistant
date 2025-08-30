const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const MurfService = require('./services/murfService');
const { getResponse, categorizeInput } = require('./data/responses');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Murf service
const murfService = new MurfService(process.env.MURF_API_KEY);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

app.use(cors());
app.use(express.static('frontend'));
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Standard REST endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, voice = 'en-US-cooper', streaming = false } = req.body;
    
    const category = categorizeInput(message);
    const responseText = getResponse(category, message);
    
    let audioData = null;
    
    if (streaming) {
      const streamResult = await murfService.streamTTS(responseText, voice, `api_${Date.now()}`);
      audioData = streamResult.audioBase64;
    } else {
      const result = await murfService.generateSpeech(responseText, voice);
      audioData = result.audioBase64;
    }
    
    res.json({
      text: responseText,
      audio: audioData,
      category: category,
      streaming: streaming
    });
    
  } catch (error) {
    console.error('Error processing chat:', error);
    res.status(500).json({ error: 'Failed to process your request' });
  }
});

// Dubbing endpoint
app.post('/api/dubbing', upload.single('audio'), async (req, res) => {
  try {
    const { sourceLanguage = 'en', targetLanguage = 'es' } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const dubbingResult = await murfService.createDubbing(audioFile.buffer, sourceLanguage, targetLanguage);
    res.json(dubbingResult);
  } catch (error) {
    console.error('Dubbing error:', error);
    res.status(500).json({ error: 'Dubbing failed' });
  }
});

// WebSocket for real-time interactions
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  const contextId = `context_${socket.id}`;
  
  // Handle streaming text messages
  socket.on('stream_text_message', async (data) => {
    try {
      const { message, voice = 'en-US-cooper' } = data;
      
      console.log(`Streaming request from ${socket.id}: "${message}"`);
      
      const category = categorizeInput(message);
      const responseText = getResponse(category, message);
      
      const audioResult = await murfService.streamTTS(responseText, voice, contextId);
      
      socket.emit('streaming_voice_response', {
        originalMessage: message,
        responseText: responseText,
        audioData: audioResult.audioBase64,
        category: category,
        duration: audioResult.duration,
        streaming: true
      });
      
    } catch (error) {
      console.error('Streaming error:', error);
      socket.emit('error', { 
        message: 'Streaming failed, try regular mode',
        fallback: true
      });
    }
  });

  // Handle standard text messages (fallback)
  socket.on('text_message', async (data) => {
    try {
      const { message, voice = 'en-US-cooper' } = data;
      
      const category = categorizeInput(message);
      const responseText = getResponse(category, message);
      
      const audioResult = await murfService.generateSpeech(responseText, voice);
      
      socket.emit('voice_response', {
        originalMessage: message,
        responseText: responseText,
        audioData: audioResult.audioBase64,
        category: category,
        streaming: false
      });
      
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Sorry, I encountered an error processing your request.' });
    }
  });
  
  // Handle voice requests
  socket.on('get_voices', async () => {
    try {
      const voices = await murfService.getAvailableVoices();
      socket.emit('available_voices', voices);
    } catch (error) {
      console.error('Error fetching voices:', error);
      socket.emit('available_voices', murfService.getFallbackVoices());
    }
  });

  // Handle dubbing requests
  socket.on('request_dubbing', async (data) => {
    try {
      const { audioData, sourceLanguage, targetLanguage } = data;
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      const dubbingResult = await murfService.createDubbing(audioBuffer, sourceLanguage, targetLanguage);
      socket.emit('dubbing_started', { 
        dubbingId: dubbingResult.id,
        status: dubbingResult.status
      });

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const status = await murfService.getDubbingStatus(dubbingResult.id);
          socket.emit('dubbing_status', status);
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
          }
        } catch (error) {
          clearInterval(pollInterval);
          socket.emit('dubbing_error', { error: error.message });
        }
      }, 3000);

    } catch (error) {
      console.error('Dubbing request failed:', error);
      socket.emit('dubbing_error', { error: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    murfService.closeConnection(contextId);
  });
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  murfService.closeAllConnections();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// ✅ Dynamic Port for Render Deployment
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Murf Voice Assistant running on port ${PORT}`);
  console.log('Features: WebSocket Streaming, AI Dubbing, Multi-language TTS');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = server;
