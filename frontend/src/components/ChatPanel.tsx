import React, { useEffect, useState, useRef } from 'react';
import socket from '../socket/socket';

interface Message {
  username: string;
  message: string;
  timestamp: string;
  origin?: string;
}

interface ChatPanelProps {
  streamId: string;
  username: string;
  isHost: boolean; // To differentiate streamer from viewers
}

const ChatPanel: React.FC<ChatPanelProps> = ({ streamId, username, isHost }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Join the chat room when streamId changes
    socket.emit('joinRoom', streamId);

    // Handle real-time incoming messages
    socket.on('receiveMessage', (msg: Message) => {
      console.log('New Message:', msg);
      setMessages((prev) => [...prev, msg]);
    });


    // Load chat history from server
    socket.on('chatHistory', (history: Message[]) => {
      setMessages(history);
    });

    // Optional: handle system messages
    socket.on('systemMessage', (msg: string) => {
      console.log('[System]', msg);
    });

    // Cleanup listeners on streamId change or unmount
    return () => {
      socket.off('receiveMessage');
      socket.off('chatHistory');
      socket.off('systemMessage');
    };
  }, [streamId]);

  useEffect(() => {
    // Scroll to the bottom when messages change
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



  const handleSend = () => {
    if (input.trim()) {
      socket.emit('sendMessage', {
        streamId,
        username,
        message: input,
        isHost: isHost,
        origin: 'app'
      });
      setInput('');
    }
  };

  return (
    <div className="w-full h-full border-l border-gray-300 bg-gray-50 flex flex-col rounded-md shadow-sm">
      <div className="flex-grow p-4 overflow-y-auto">
        {messages.length > 0 ? (messages.map((msg, idx) => (
          <div key={idx} className="m-2">
            <span className={`font-bold ${msg.origin === 'app' ? "text-green-400" : "text-red-400"}`}>
              {msg.origin ? `[from ${msg.origin}] ` : ''}
            </span>
            <span className=" text-purple-700 font-semibold">
              {msg.username}:
            </span> {msg.message}
          </div>
        ))) : (
          <div className="text-gray-400 italic text-center p-4">You can be the first to start chatting...</div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 border-t flex items-center">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-grow border px-4 py-3 rounded mr-2"
          placeholder="Type a message..."
        />
        <button
          onClick={handleSend}
          className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;