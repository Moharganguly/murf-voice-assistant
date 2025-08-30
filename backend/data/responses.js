// Sample responses for different categories
const responses = {
  greeting: [
    "Hello! How can I assist you today?",
    "Hi there! What can I help you with?",
    "Welcome! I'm here to help you."
  ],
  support: [
    "I understand you need support. Let me help you with that.",
    "I'm here to assist you. Can you provide more details about your issue?",
    "Let me connect you with the right information to resolve your concern."
  ],
  product_info: [
    "I'd be happy to provide information about our products.",
    "Let me help you find the product details you're looking for.",
    "What specific product information do you need?"
  ],
  default: [
    "I understand your question. Let me help you with that.",
    "Thank you for reaching out. How can I assist you?",
    "I'm here to help. Could you provide more details?"
  ]
};

function categorizeInput(message) {
  const text = message.toLowerCase();
  
  if (text.includes('hello') || text.includes('hi') || text.includes('hey') || text.includes('good morning') || text.includes('good afternoon')) {
    return 'greeting';
  }
  
  if (text.includes('help') || text.includes('support') || text.includes('issue') || 
      text.includes('problem') || text.includes('account') || text.includes('question') || 
      text.includes('trouble') || text.includes('error')) {
    return 'support';
  }
  
  if (text.includes('product') || text.includes('item') || text.includes('buy') || 
      text.includes('purchase') || text.includes('service') || text.includes('features') || 
      text.includes('pricing') || text.includes('tell me about')) {
    return 'product_info';
  }
  
  return 'default';
}

function getResponse(category, originalMessage) {
  const categoryResponses = responses[category] || responses.default;
  const randomIndex = Math.floor(Math.random() * categoryResponses.length);
  return categoryResponses[randomIndex];
}

module.exports = {
  getResponse,
  categorizeInput,
  responses
};
