const axios = require('axios');
const WebSocket = require('ws');
const FormData = require('form-data');

class MurfService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.murf.ai/v1';
    this.wsURL = 'wss://api.murf.ai/v1/text-to-speech/websocket';
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    this.activeConnections = new Map();
  }

  // WebSocket Streaming for Ultra-Low Latency TTS
  async createWebSocketConnection(contextId = null) {
    try {
      const ws = new WebSocket(this.wsURL, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return new Promise((resolve, reject) => {
        ws.on('open', () => {
          console.log(`Murf WebSocket connected for context: ${contextId}`);
          if (contextId) {
            this.activeConnections.set(contextId, ws);
          }
          resolve(ws);
        });
        
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        ws.on('close', () => {
          if (contextId) {
            this.activeConnections.delete(contextId);
          }
        });
      });
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      throw error;
    }
  }

  // Stream TTS with Real-Time Audio Generation
  async streamTTS(text, voiceId = 'en-US-cooper', contextId = null) {
    try {
      const ws = await this.createWebSocketConnection(contextId);
      
      const payload = {
        text: text,
        voice_id: voiceId,
        format: 'MP3',
        speed: 1.0,
        pitch: 0,
        style: 'conversational',
        quality: 'high',
        context_id: contextId || `stream_${Date.now()}`
      };

      console.log('Streaming TTS request:', { text: text.substring(0, 50), voiceId });
      ws.send(JSON.stringify(payload));

      return new Promise((resolve, reject) => {
        const audioChunks = [];
        let metadata = {};

        ws.on('message', (data) => {
          try {
            const response = JSON.parse(data);
            
            if (response.type === 'audio_chunk') {
              audioChunks.push(Buffer.from(response.data, 'base64'));
            }
            
            if (response.type === 'metadata') {
              metadata = response;
            }
            
            if (response.type === 'complete') {
              const audioBuffer = Buffer.concat(audioChunks);
              resolve({
                audio: audioBuffer,
                audioBase64: audioBuffer.toString('base64'),
                duration: metadata.duration || null,
                sampleRate: metadata.sample_rate || 24000,
                format: 'MP3'
              });
              ws.close();
            }
            
            if (response.type === 'error') {
              reject(new Error(response.message));
              ws.close();
            }
          } catch (parseError) {
            console.error('Failed to parse WebSocket response:', parseError);
          }
        });

        // Timeout fallback
        setTimeout(() => {
          reject(new Error('Streaming timeout - falling back to standard TTS'));
          ws.close();
        }, 10000);
      });
    } catch (error) {
      console.error('Streaming TTS failed:', error);
      // Fallback to regular TTS
      return this.generateSpeech(text, voiceId);
    }
  }

  // Standard TTS (Fallback)
  async generateSpeech(text, voice = 'en-US-cooper') {
    try {
      console.log(`Fallback TTS for: "${text}" with voice: ${voice}`);
      
      const response = await axios.post(`${this.baseURL}/text-to-speech/generate`, {
        voice_id: voice,
        text: text,
        speed: 1.0,
        pitch: 0,
        format: 'MP3',
        quality: 'high'
      }, {
        headers: this.headers,
        timeout: 15000
      });

      return {
        success: true,
        audioBase64: response.data.audio_base64 || null,
        audio: response.data.audio_base64 ? Buffer.from(response.data.audio_base64, 'base64') : null,
        duration: response.data.duration,
        format: 'MP3'
      };
    } catch (error) {
      console.error('Standard TTS failed:', error);
      return {
        success: false,
        audioBase64: null,
        message: 'TTS generation failed - using text-only response'
      };
    }
  }

  // AI Dubbing Implementation
  async createDubbing(audioFile, sourceLanguage = 'en', targetLanguage = 'es') {
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('source_language', sourceLanguage);
      formData.append('target_language', targetLanguage);
      formData.append('quality', 'premium');
      formData.append('preserve_timing', 'true');

      const response = await axios.post(`${this.baseURL}/dubbing/create`, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('Dubbing creation failed:', error);
      throw error;
    }
  }

  async getDubbingStatus(dubbingId) {
    try {
      const response = await axios.get(`${this.baseURL}/dubbing/${dubbingId}/status`, {
        headers: this.headers
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get dubbing status:', error);
      throw error;
    }
  }

  async getAvailableVoices() {
    try {
      const response = await axios.get(`${this.baseURL}/voices`, {
        headers: this.headers
      });
      return response.data.voices || this.getFallbackVoices();
    } catch (error) {
      console.error('Error fetching voices:', error);
      return this.getFallbackVoices();
    }
  }

  getFallbackVoices() {
    return [
      { id: 'en-US-cooper', name: 'Cooper', language: 'en-US', gender: 'male', style: 'professional' },
      { id: 'en-US-sarah', name: 'Sarah', language: 'en-US', gender: 'female', style: 'friendly' },
      { id: 'en-UK-brian', name: 'Brian', language: 'en-UK', gender: 'male', style: 'formal' },
      { id: 'en-US-emma', name: 'Emma', language: 'en-US', gender: 'female', style: 'conversational' },
      { id: 'es-ES-carlos', name: 'Carlos', language: 'es-ES', gender: 'male', style: 'warm' },
      { id: 'fr-FR-marie', name: 'Marie', language: 'fr-FR', gender: 'female', style: 'elegant' }
    ];
  }

  // Cleanup connections
  closeConnection(contextId) {
    const connection = this.activeConnections.get(contextId);
    if (connection) {
      connection.close();
      this.activeConnections.delete(contextId);
    }
  }

  closeAllConnections() {
    for (const [contextId, connection] of this.activeConnections) {
      connection.close();
    }
    this.activeConnections.clear();
  }
}

module.exports = MurfService;
