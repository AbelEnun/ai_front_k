import React, { useState, useEffect, useRef } from 'react'

const API_URL = "https://n47nhob5fe.execute-api.us-east-1.amazonaws.com/prod/chat";
const CUSTOMER_ID = "test_user_1";
const CUSTOMER_INITIALS = "A";

const SUGGESTIONS = [
  "I want a beach holiday 🏖️",
  "Family trip ideas",
  "Zanzibar packages",
  "Dubai in December",
  "Budget under $1500"
];

function App() {
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem("katim_history");
    return saved ? JSON.parse(saved) : [];
  });
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem("katim_sessions");
    return saved ? JSON.parse(saved) : {};
  });
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeSuggestions, setActiveSuggestions] = useState([]);
  const [activeDetailPackage, setActiveDetailPackage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Sync history to localStorage
  useEffect(() => {
    localStorage.setItem("katim_history", JSON.stringify(chatHistory));
  }, [chatHistory]);

  // Sync sessions to localStorage
  useEffect(() => {
    localStorage.setItem("katim_sessions", JSON.stringify(sessions));
  }, [sessions]);

  const currentMessages = currentSessionId ? (sessions[currentSessionId] || []) : [];

  // Scroll to bottom when messages or typing status changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages, isTyping, activeSuggestions]);

  // Helper to save/update a session in history list
  const saveSessionToHistory = (sessionId, previewText) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatHistory(prevHistory => {
      const existingIdx = prevHistory.findIndex(s => s.id === sessionId);
      if (existingIdx !== -1) {
        const updated = [...prevHistory];
        updated[existingIdx] = { ...updated[existingIdx], preview: previewText, time: now };
        // Bring to front (most recently active)
        const item = updated.splice(existingIdx, 1)[0];
        return [...updated, item];
      } else {
        return [...prevHistory, { id: sessionId, preview: previewText, time: now }];
      }
    });
  };

  // Start chat helper
  const startChat = () => {
    const newId = "session_" + Date.now();
    setCurrentSessionId(newId);
    setSessions(prev => ({
      ...prev,
      [newId]: []
    }));
    setActiveSuggestions([]);
    setSidebarOpen(false);
    sendToKatimAi(newId, "Hello");
  };

  // New chat helper (clears active screen/starts fresh session)
  const newChat = () => {
    const newId = "session_" + Date.now();
    setCurrentSessionId(newId);
    setSessions(prev => ({
      ...prev,
      [newId]: []
    }));
    setActiveSuggestions([]);
    setSidebarOpen(false);
    sendToKatimAi(newId, "Hello");
  };

  // Load an existing session
  const loadSession = (id) => {
    setCurrentSessionId(id);
    setActiveSuggestions([]);
    setSidebarOpen(false);
    if (!sessions[id]) {
      // Initialize with welcome back message if not in memory
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSessions(prev => ({
        ...prev,
        [id]: [
          {
            id: 'welcome_' + Date.now(),
            role: 'katim-ai',
            text: "Welcome back! What would you like to explore today?",
            time: now
          }
        ]
      }));
    }
  };

  const deleteSession = (e, sessionId) => {
    e.stopPropagation();
    setChatHistory(prevHistory => prevHistory.filter(s => s.id !== sessionId));
    setSessions(prevSessions => {
      const updated = { ...prevSessions };
      delete updated[sessionId];
      return updated;
    });
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendTextDirectly(text);
  };

  const sendTextDirectly = async (text) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      text,
      time: now
    };

    setSessions(prev => ({
      ...prev,
      [currentSessionId]: [...(prev[currentSessionId] || []), userMsg]
    }));

    saveSessionToHistory(currentSessionId, text);
    setActiveSuggestions([]);

    await sendToKatimAi(currentSessionId, text);
  };

  const sendToKatimAi = async (sessionId, text) => {
    setIsTyping(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sessionId, customer_id: CUSTOMER_ID })
      });
      const data = await res.json();
      let body = data;
      if (typeof data.body === "string") body = JSON.parse(data.body);

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let newMessages = [];
      if (body.type === "whatsapp_handoff") {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now() + '_1',
          role: 'katim-ai',
          text: body.message,
          time: now
        });
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now() + '_2',
          role: 'katim-ai',
          type: 'whatsapp_handoff',
          handoff_summary: body.handoff_summary,
          time: now
        });
      } else if (body.type === "results") {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now() + '_1',
          role: 'katim-ai',
          text: body.message,
          time: now
        });
        if (body.packages && body.packages.length > 0) {
          newMessages.push({
            id: 'msg_katim_ai_' + Date.now() + '_2',
            role: 'katim-ai',
            type: 'results',
            packages: body.packages,
            time: now
          });
        }
      } else {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now(),
          role: 'katim-ai',
          text: body.message || "Let me help you find the perfect trip!",
          time: now
        });
      }

      setSessions(prev => {
        const currentList = prev[sessionId] || [];
        const merged = [...currentList, ...newMessages];

        // Show suggestions if normal message count is <= 2
        // We filter out structural rows like results and handoffs from count check
        const normalMsgCount = merged.filter(m => !m.type || (m.type !== 'results' && m.type !== 'whatsapp_handoff')).length;
        if (normalMsgCount <= 2) {
          setActiveSuggestions(SUGGESTIONS);
        }

        return {
          ...prev,
          [sessionId]: merged
        };
      });

    } catch (err) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSessions(prev => ({
        ...prev,
        [sessionId]: [
          ...(prev[sessionId] || []),
          {
            id: 'msg_error_' + Date.now(),
            role: 'katim-ai',
            text: "I'm having a little trouble connecting right now. Could you try again in a moment?",
            time: now
          }
        ]
      }));
    } finally {
      setIsTyping(false);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 50);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
  };

  const handleSuggestionClick = (suggestion) => {
    sendTextDirectly(suggestion);
  };

  const handleHandoffClick = (summary) => {
    window.location.href = "https://wa.me/1234567890?text=" + encodeURIComponent(summary || "Hi, I need help with my travel booking");
  };

  return (
    <div className="page">
      {/* Sidebar overlay for mobile viewports */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — chat history */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">Katim <span>Travels</span></div>
          <div className="tagline">Your journey starts here</div>
        </div>

        <div className="katim-ai-card">
          <div className="katim-ai-row">
            <div className="katim-ai-avatar">✈️</div>
            <div>
              <div className="katim-ai-name">Katim Ai</div>
              <div className="katim-ai-role">
                <span className="status-dot"></span>
                Online now
              </div>
            </div>
          </div>
          <div className="katim-ai-desc">Your personal AI travel advisor — here to find your perfect trip.</div>
        </div>

        <button className="new-chat-btn" onClick={newChat}>＋ New Conversation</button>

        <div className="history-label">Recent Chats</div>
        <div className="history-list">
          {chatHistory.length === 0 ? (
            <div className="history-empty">Your conversations will appear here</div>
          ) : (
            chatHistory.slice().reverse().map((item) => (
              <div
                key={item.id}
                className={`history-item ${item.id === currentSessionId ? 'active' : ''}`}
                onClick={() => loadSession(item.id)}
              >
                <div className="history-item-content">
                  <div className="history-preview">{item.preview}</div>
                  <div className="history-time">{item.time}</div>
                </div>
                <button
                  className="delete-history-btn"
                  onClick={(e) => deleteSession(e, item.id)}
                  title="Delete conversation"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-area">
        {currentSessionId === null ? (
          <div className="welcome">
            <button className="sidebar-toggle-btn welcome-toggle" onClick={() => setSidebarOpen(true)}>☰ View Conversations</button>
            <div className="welcome-icon">🌍</div>
            <div className="welcome-title">Meet Katim Ai</div>
            <div className="welcome-sub">Your personal AI travel advisor from Katim Travels. Tell me where you want to go and I'll take care of the rest.</div>
            <button className="start-btn" onClick={startChat}>Start Planning My Trip</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="chat-header">
              <div className="chat-header-left">
                <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)}>☰</button>
                <div className="chat-brand">
                  <span className="chat-logo-text">Katim AI</span>
                  <span className="online-indicator"></span>
                </div>
              </div>
              <button className="icon-btn" title="Clear chat" onClick={newChat}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/>
                </svg>
              </button>
            </div>

            <div className="messages">
              {currentMessages.map((msg) => {
                if (msg.type === 'whatsapp_handoff') {
                  return (
                    <div key={msg.id} className="handoff-card">
                      <div className="handoff-content">
                        <svg className="whatsapp-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.488 1.45 5.41 1.451 5.378 0 9.755-4.373 9.758-9.755.002-2.607-1.011-5.059-2.854-6.904C17.077 2.1 14.624.95 12.012.95c-5.383 0-9.76 4.373-9.763 9.756-.001 1.887.49 3.729 1.42 5.356L2.686 21.57l5.96-1.562zm10.741-6.732c-.27-.136-1.602-.79-1.85-.88-.25-.09-.43-.136-.61.136-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.065-2.28-1.127-3.77-2.124-4.88-4.026-.26-.45.26-.42.74-1.38.08-.16.04-.3-.02-.436-.06-.137-.61-1.473-.83-2.022-.22-.52-.47-.45-.64-.46H7.9c-.18 0-.47.07-.71.32-.24.25-.92.902-.92 2.2 0 1.3.94 2.56 1.07 2.73.13.17 1.86 2.839 4.5 3.98.63.27 1.12.44 1.5.56.63.2 1.2.17 1.66.1 1.13-.17 1.6-.69 1.77-1.14.17-.45.17-.84.12-.927-.05-.08-.18-.13-.45-.26z" />
                        </svg>
                        <span className="handoff-message-text">Our team will reach out shortly</span>
                      </div>
                      <button className="handoff-btn" onClick={() => handleHandoffClick(msg.handoff_summary)}>
                        Open WhatsApp
                      </button>
                    </div>
                  );
                }

                if (msg.type === 'results') {
                  return (
                    <div key={msg.id} className="msg-row results-message-row">
                      <div className="msg-avatar katim-ai">✈️</div>
                      <div className="msg-content results-message-content">
                        <div className="msg-name">Katim Ai</div>
                        <div className="packages-container">
                          {msg.packages && msg.packages.map((pkg, idx) => {
                            return (
                              <div key={`${msg.id}_pkg_${idx}`} className="package-card">
                                <div className="package-image-wrap">
                                  {pkg.image ? (
                                    <img src={pkg.image} alt={pkg.name} className="package-image" />
                                  ) : (
                                    <div className="package-image-placeholder">
                                      <span>🗺️</span>
                                    </div>
                                  )}
                                  <div className="package-gradient-overlay" />
                                  <h4 className="package-title">{pkg.name || 'Travel Package'}</h4>
                                </div>
                                <div className="package-info-body">
                                  <div className="package-meta-row">
                                    <span className="package-duration">
                                      <svg className="calendar-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
                                      </svg>
                                      {pkg.duration ? `${pkg.duration} Days` : 'Flexible'}
                                    </span>
                                    {pkg.price && pkg.price > 0 ? (
                                      <span className="package-price price-gold">From ${Math.round(pkg.price)}</span>
                                    ) : (
                                      <span className="package-price price-request">Price on request</span>
                                    )}
                                  </div>
                                  <p className="package-description" title={pkg.description}>
                                    {pkg.description || ''}
                                  </p>
                                  <button
                                    className="package-book-btn"
                                    onClick={() => setActiveDetailPackage(pkg)}
                                  >
                                    View Package
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="msg-time">{msg.time}</div>
                      </div>
                    </div>
                  );
                }

                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`msg-row ${isUser ? 'user' : ''}`}>
                    <div className={`msg-avatar ${isUser ? 'user-av' : 'katim-ai'}`}>
                      {isUser ? CUSTOMER_INITIALS : '✈️'}
                    </div>
                    <div className="msg-content">
                      <div className="msg-name">{isUser ? 'You' : 'Katim Ai'}</div>
                      <div className={`bubble ${isUser ? 'user' : 'katim-ai'}`}>{msg.text}</div>
                      <div className="msg-time">{msg.time}</div>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="msg-row" id="typing-indicator">
                  <div className="msg-avatar katim-ai">✈️</div>
                  <div className="msg-content">
                    <div className="msg-name">Katim Ai</div>
                    <div className="typing-bubble">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  </div>
                </div>
              )}

              {activeSuggestions.length > 0 && (
                <div className="suggestions">
                  {activeSuggestions.map((s, idx) => (
                    <button
                      key={`suggest_${idx}`}
                      className="suggestion-chip"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <div className="input-wrap">
                <textarea
                  ref={textareaRef}
                  className="msg-input"
                  placeholder="Ask Katim Ai anything about your trip..."
                  rows={1}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                />
                <button
                  className="send-btn"
                  disabled={!inputValue.trim() || isTyping}
                  onClick={handleSend}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42L16.86 11H5v2z"/>
                  </svg>
                </button>
              </div>
              <div className="input-hint">Search packages · destination questions · connect with our team</div>
            </div>
          </div>
        )}
      </main>

      {activeDetailPackage && (
        <div className="modal-overlay" onClick={() => setActiveDetailPackage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveDetailPackage(null)}>✕</button>
            <div className="modal-image-wrap">
              {activeDetailPackage.image ? (
                <img src={activeDetailPackage.image} alt={activeDetailPackage.name} className="modal-image" />
              ) : (
                <div className="modal-image-placeholder">
                  <span>🗺️</span>
                </div>
              )}
              <div className="modal-gradient-overlay" />
              <h3 className="modal-title">{activeDetailPackage.name}</h3>
            </div>
            <div className="modal-body">
              <div className="modal-meta-row">
                <div className="modal-meta-item">
                  <span className="modal-meta-label">Duration</span>
                  <span className="modal-meta-value">🕒 {activeDetailPackage.duration ? `${activeDetailPackage.duration} Days` : 'Flexible'}</span>
                </div>
                <div className="modal-meta-item">
                  <span className="modal-meta-label">Starting Price</span>
                  <span className="modal-meta-value price-highlight">
                    {activeDetailPackage.price && activeDetailPackage.price > 0 ? `From $${Math.round(activeDetailPackage.price)}` : 'Price on request'}
                  </span>
                </div>
              </div>

              {activeDetailPackage.operator && (
                <div className="modal-operator-info">
                  <span className="modal-meta-label">Tour Operator</span>
                  <div>
                    <span className="operator-badge">{activeDetailPackage.operator}</span>
                  </div>
                </div>
              )}

              <div className="modal-description-section">
                <span className="modal-meta-label">Description</span>
                <p className="modal-description">{activeDetailPackage.description}</p>
              </div>

              <button
                className="modal-book-btn"
                onClick={() => {
                  const hasPrice = activeDetailPackage.price && activeDetailPackage.price > 0;
                  const priceDisplay = hasPrice ? `From $${Math.round(activeDetailPackage.price)}` : "Price on request";
                  handleHandoffClick(`I'm interested in the "${activeDetailPackage.name}" package (${activeDetailPackage.duration || 0} Days) - ${priceDisplay}.`);
                  setActiveDetailPackage(null);
                }}
              >
                Inquire & Book via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
