// frontend/js/app.js
class VoiceAssistant {
  constructor() {
    this.socket = io();
    this.currentVoice = 'en-US-cooper';
    
    this.initializeElements();
    this.setupEventListeners();
    this.setupSocketListeners();
  }
  
  initializeElements() {
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.chatHistory = document.getElementById('chatHistory');
    this.status = document.getElementById('status');
    this.voiceSelect = document.getElementById('voiceSelect');
    this.quickBtns = document.querySelectorAll('.quick-btn');
  }
  
  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
    
    this.voiceSelect.addEventListener('change', (e) => {
      this.currentVoice = e.target.value;
    });
    
    this.quickBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const message = e.target.getAttribute('data-message');
        this.messageInput.value = message;
        this.sendMessage();
      });
    });
  }
  
  setupSocketListeners() {
    this.socket.on('voice_response', (data) => {
      this.displayResponse(data);
      this.playAudioResponse(data.audioData);
    });
    
    this.socket.on('available_voices', (voices) => {
      this.updateVoiceOptions(voices);
    });
    
    this.socket.on('error', (error) => {
      this.updateStatus(`Error: ${error.message}`);
    });
    
    // Request available voices on connection
    this.socket.emit('get_voices');
  }
  
  sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;
    
    // Display user message
    this.addMessageToHistory('user', message);
    
    // Clear input and update status
    this.messageInput.value = '';
    this.updateStatus('Processing your request...');
    
    // Send to server
    this.socket.emit('text_message', {
      message: message,
      voice: this.currentVoice
    });
  }
  
  displayResponse(data) {
    this.addMessageToHistory('assistant', data.responseText, data.category);
    this.updateStatus('Response ready! Playing audio...');
  }
  
  addMessageToHistory(sender, message, category = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const timestamp = new Date().toLocaleTimeString();
    const categoryBadge = category ? `<span class="category-badge">${category}</span>` : '';
    
    messageDiv.innerHTML = `
      <div class="message-header">
        <strong>${sender === 'user' ? 'You' : 'Assistant'}</strong>
        <span class="timestamp">${timestamp}</span>
        ${categoryBadge}
      </div>
      <div class="message-content">${message}</div>
    `;
    
    this.chatHistory.appendChild(messageDiv);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }
  
  playAudioResponse(audioData) {
    if (audioData && audioData.audioContent) {
      // Create audio element from base64 data
      const audio = new Audio(`data:audio/mp3;base64,${audioData.audioContent}`);
      
      audio.play()
        .then(() => {
          this.updateStatus('Ready for your next question!');
        })
        .catch((error) => {
          console.error('Error playing audio:', error);
          this.updateStatus('Audio playback failed, but response is ready!');
        });
    } else {
      this.updateStatus('Ready for your next question!');
    }
  }
  
  updateVoiceOptions(voices) {
    if (voices && voices.length > 0) {
      this.voiceSelect.innerHTML = '';
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = `${voice.name} (${voice.language})`;
        this.voiceSelect.appendChild(option);
      });
    }
  }
  
  updateStatus(message) {
    this.status.textContent = message;
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  new VoiceAssistant();
});
