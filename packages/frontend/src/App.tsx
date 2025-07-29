import React, { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: inputMessage }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f3f4f6',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '1rem 2rem',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ 
          color: '#1f2937', 
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 'bold'
        }}>
          🧠 Asera LLM Chatbot
        </h1>
        <p style={{ 
          color: '#6b7280', 
          margin: '0.25rem 0 0 0',
          fontSize: '0.9rem'
        }}>
          Powered by Claude AI
        </p>
      </div>

      {/* Chat Messages */}
      <div style={{
        flex: 1,
        padding: '1rem',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 200px)'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            marginTop: '2rem'
          }}>
            <p>👋 Welcome! Ask me anything to get started.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Try: "Hello!", "What can you help me with?", or "Tell me a joke"
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                maxWidth: '70%',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                backgroundColor: message.role === 'user' ? '#3b82f6' : 'white',
                color: message.role === 'user' ? 'white' : '#1f2937',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none'
              }}>
                <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                  {message.role === 'user' ? '👤 You' : '🤖 Assistant'}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '0.25rem' }}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '1rem'
          }}>
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '1rem',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', opacity: 0.7 }}>
                🤖 Assistant
              </div>
              <div style={{ color: '#6b7280' }}>
                Thinking... 💭
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        backgroundColor: 'white',
        padding: '1rem 2rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: !inputMessage.trim() || isLoading ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              cursor: !inputMessage.trim() || isLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App; 