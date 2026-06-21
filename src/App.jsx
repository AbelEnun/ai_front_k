import React, { useState, useEffect, useRef } from 'react'

const API_URL = "https://n47nhob5fe.execute-api.us-east-1.amazonaws.com/prod/chat";
const CUSTOMER_ID = "test_user_1";
const CUSTOMER_INITIALS = "👤";

const SUGGESTIONS = [
  "Show me packages ✈️",
  "Luxury trips 💎",
  "Budget under $500 💰"
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
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("katim_theme");
    return saved ? saved : "dark";
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem("katim_theme", theme);
  }, [theme]);
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

  // New chat helper (clears active screen/starts fresh session and starts conversation automatically)
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



  const handleQuickStart = async (query) => {
    const newId = "session_" + Date.now();
    setCurrentSessionId(newId);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      text: query,
      time: now
    };

    setSessions(prev => ({
      ...prev,
      [newId]: [userMsg]
    }));

    saveSessionToHistory(newId, query);
    setActiveSuggestions([]);
    setSidebarOpen(false);

    await sendToKatimAi(newId, query);
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
          id: 'msg_katim_ai_' + Date.now(),
          role: 'katim-ai',
          type: 'results',
          text: body.message,
          packages: body.packages || [],
          time: now
        });
      } else if (body.type === "no_results") {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now(),
          role: 'katim-ai',
          type: 'results',
          text: body.message,
          packages: body.recommendations || [],
          time: now
        });
      } else if (body.type === "booking_ready" && body.package) {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now(),
          role: 'katim-ai',
          type: 'booking_ready',
          text: body.message,
          package: body.package,
          time: now
        });
      } else if (body.type === "package_detail" && body.package) {
        newMessages.push({
          id: 'msg_katim_ai_' + Date.now(),
          role: 'katim-ai',
          type: 'package_detail',
          text: body.message,
          package: body.package,
          time: now
        });
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
        const normalMsgCount = merged.length;
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
    window.open("https://wa.me/1234567890?text=" + encodeURIComponent(summary || "Hi, I need help with my travel booking"), "_blank");
  };

  return (
    <div className="page">
      {/* Sidebar overlay for mobile viewports */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — chat history */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <div className="logo">Katim <span>Travels</span></div>
          </div>
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

            <div className="welcome-hero">
              <div className="welcome-badge">PREMIUM TRAVEL ADVISOR</div>
              <h1 className="welcome-title">Discover Your Next Adventure with <span>Katim AI</span></h1>
              <p className="welcome-sub">
                Your bespoke AI travel companion from Katim Travels. Explore custom packages, seek destination insights, or plan your dream itinerary in real-time.
              </p>

              <button className="start-btn" onClick={startChat}>
                Start Planning My Trip ➔
              </button>
            </div>

            <div className="welcome-features-section">
              <h3 className="section-subtitle">How can I assist you today?</h3>
              <div className="welcome-features-grid">
                <div className="feature-item-card" onClick={() => handleQuickStart("Show me popular city break destinations 🏙️")}>
                  <div className="feature-icon">🏙️</div>
                  <h4>City Breaks</h4>
                  <p>Discover vibrant cities, iconic landmarks, and unforgettable urban experiences.</p>
                  <span className="feature-action-link">Explore cities ➔</span>
                </div>

                <div className="feature-item-card" onClick={() => handleQuickStart("Show me beach and island holiday packages 🏖️")}>
                  <div className="feature-icon">🏖️</div>
                  <h4>Beach & Islands</h4>
                  <p>Relax on pristine shores, turquoise waters, and tropical island paradises.</p>
                  <span className="feature-action-link">Find beach trips ➔</span>
                </div>

                <div className="feature-item-card" onClick={() => handleQuickStart("Recommend adventure and outdoor travel packages 🏔️")}>
                  <div className="feature-icon">🏔️</div>
                  <h4>Adventure Travel</h4>
                  <p>Hike mountains, trek forests, and explore wild landscapes worldwide.</p>
                  <span className="feature-action-link">Start an adventure ➔</span>
                </div>

                <div className="feature-item-card" onClick={() => handleQuickStart("Show me luxury travel packages worldwide 💎")}>
                  <div className="feature-icon">💎</div>
                  <h4>Luxury Escapes</h4>
                  <p>Indulge in five-star resorts, private villas, and bespoke travel experiences.</p>
                  <span className="feature-action-link">Browse luxury ➔</span>
                </div>
              </div>
            </div>

            <div className="welcome-footer-tag">
              ⚡ <span>Trusted by travelers across the globe</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="chat-header">
              <div className="chat-header-left">
                <div className="chat-brand">
                  <span className="chat-logo-text">Katim AI</span>
                  <span className="online-indicator"></span>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle Theme">
                  {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                </button>
              </div>
            </div>

            <div className="messages">
              <div className="messages-column">
                {(() => {
                  const groups = [];
                  currentMessages.forEach((msg) => {
                    const last = groups[groups.length - 1];
                    if (last && last.role === msg.role) {
                      last.items.push(msg);
                    } else {
                      groups.push({
                        role: msg.role,
                        items: [msg]
                      });
                    }
                  });

                  return groups.map((group, groupIdx) => {
                    const isUser = group.role === 'user';
                    const firstMsg = group.items[0];
                    return (
                      <div key={`group_${groupIdx}`} className={`msg-group ${isUser ? 'user' : 'katim-ai'}`}>
                        <div className="msg-group-content">
                          <div className="msg-bubbles-list">
                            {group.items.map((msg) => {
                              if (msg.type === 'whatsapp_handoff') {
                                return (
                                  <div key={msg.id} className="handoff-card">
                                    <div className="handoff-content">
                                      <div className="whatsapp-icon-badge">
                                        <svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff">
                                          <path d="M12.001 2C6.479 2 2.003 6.477 2.003 12c0 1.849.504 3.682 1.463 5.284L2 22l4.833-1.437A9.955 9.955 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.18a8.162 8.162 0 0 1-4.159-1.139l-.298-.177-3.085.917.877-3.019-.193-.31A8.154 8.154 0 0 1 3.82 12c0-4.512 3.669-8.18 8.181-8.18 4.512 0 8.18 3.668 8.18 8.18 0 4.511-3.668 8.18-8.18 8.18zm4.495-6.123c-.246-.123-1.457-.719-1.683-.801-.226-.082-.39-.123-.554.123-.164.246-.636.801-.78.966-.144.164-.287.185-.533.062-1.53-.765-2.536-1.367-3.544-3.1-.268-.46.268-.428.766-1.425.082-.164.041-.308-.021-.43-.062-.124-.554-1.336-.759-1.83-.2-.481-.404-.414-.554-.421h-.472c-.164 0-.43.062-.656.308-.226.245-.863.844-.863 2.058 0 1.214.884 2.387.997 2.551.113.164 1.748 2.668 4.237 3.741.592.256 1.053.41 1.412.525.594.19 1.135.163 1.562.099 1.01-.154 1.498-.632 1.664-1.055.166-.423.166-.785.103-.86-.062-.082-.226-.144-.472-.267z"/>
                                        </svg>
                                      </div>
                                      <div className="handoff-text-group">
                                        <span className="handoff-label">WhatsApp</span>
                                        <span className="handoff-message-text">Our team will reach out shortly</span>
                                      </div>
                                    </div>
                                    <button className="handoff-btn" onClick={() => handleHandoffClick(msg.handoff_summary)}>
                                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{flexShrink:0}}>
                                        <path d="M12.001 2C6.479 2 2.003 6.477 2.003 12c0 1.849.504 3.682 1.463 5.284L2 22l4.833-1.437A9.955 9.955 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.18a8.162 8.162 0 0 1-4.159-1.139l-.298-.177-3.085.917.877-3.019-.193-.31A8.154 8.154 0 0 1 3.82 12c0-4.512 3.669-8.18 8.181-8.18 4.512 0 8.18 3.668 8.18 8.18 0 4.511-3.668 8.18-8.18 8.18zm4.495-6.123c-.246-.123-1.457-.719-1.683-.801-.226-.082-.39-.123-.554.123-.164.246-.636.801-.78.966-.144.164-.287.185-.533.062-1.53-.765-2.536-1.367-3.544-3.1-.268-.46.268-.428.766-1.425.082-.164.041-.308-.021-.43-.062-.124-.554-1.336-.759-1.83-.2-.481-.404-.414-.554-.421h-.472c-.164 0-.43.062-.656.308-.226.245-.863.844-.863 2.058 0 1.214.884 2.387.997 2.551.113.164 1.748 2.668 4.237 3.741.592.256 1.053.41 1.412.525.594.19 1.135.163 1.562.099 1.01-.154 1.498-.632 1.664-1.055.166-.423.166-.785.103-.86-.062-.082-.226-.144-.472-.267z"/>
                                      </svg>
                                      Open WhatsApp
                                    </button>
                                  </div>
                                );
                              }

                              if (msg.type === 'results') {
                                return (
                                  <div key={msg.id} className="results-bubble-container">
                                    {msg.text && (
                                      <div className="bubble katim-ai" style={{ marginBottom: '12px' }}>
                                        {msg.text}
                                      </div>
                                    )}
                                    <div className="packages-container">
                                      {msg.packages && msg.packages.map((pkg, idx) => (
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
                                                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
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
                                      ))}
                                    </div>
                                  </div>
                                );
                              }

                              if (msg.type === 'booking_ready' && msg.package) {
                                const pkg = msg.package;
                                return (
                                  <div key={msg.id} className="results-bubble-container">
                                    {msg.text && (
                                      <div className="bubble katim-ai" style={{ marginBottom: '12px' }}>
                                        {msg.text}
                                      </div>
                                    )}
                                    <div className="booking-ready-label">
                                      <span className="booking-ready-dot" />
                                      Ready to Book
                                    </div>
                                    <div className="packages-container">
                                      <div className="package-card">
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
                                                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
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
                                            className="package-book-btn package-book-btn--cta"
                                            onClick={() => setActiveDetailPackage(pkg)}
                                          >
                                            View &amp; Book Package
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (msg.type === 'package_detail' && msg.package) {
                                const pkg = msg.package;
                                return (
                                  <div key={msg.id} className="results-bubble-container">
                                    {msg.text && (
                                      <div className="bubble katim-ai" style={{ marginBottom: '12px' }}>
                                        {msg.text}
                                      </div>
                                    )}
                                    <div className="packages-container">
                                      <div className="package-card">
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
                                                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
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
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={msg.id} className={`bubble ${isUser ? 'user' : 'katim-ai'}`}>{msg.text}</div>
                              );
                            })}
                          </div>
                          <div className="msg-time">{firstMsg.time}</div>
                        </div>
                      </div>
                    );
                  });
                })()}

                {isTyping && (
                  <div className="msg-group katim-ai" id="typing-indicator">
                    <div className="msg-group-content">
                      <div className="typing-bubble">
                        <div className="dot"></div>
                        <div className="dot"></div>
                        <div className="dot"></div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="input-area">
              <div className="input-area-column">
                {activeSuggestions.length > 0 && (
                  <div className="input-suggestions">
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
                      <path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42L16.86 11H5v2z" />
                    </svg>
                  </button>
                </div>
                <div className="input-hint">Search packages · destination questions · connect with our team</div>
              </div>
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

              <div className="modal-actions">
                <button
                  disabled
                  className="modal-book-btn"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Book on Website (Coming Soon)
                </button>
                <button
                  className="modal-whatsapp-btn"
                  onClick={() => {
                    const hasPrice = activeDetailPackage.price && activeDetailPackage.price > 0;
                    const priceDisplay = hasPrice ? `From $${Math.round(activeDetailPackage.price)}` : "Price on request";
                    handleHandoffClick(`I'm interested in the "${activeDetailPackage.name}" package (${activeDetailPackage.duration || 0} Days) - ${priceDisplay}.`);
                    setActiveDetailPackage(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{flexShrink:0}}>
                    <path d="M12.001 2C6.479 2 2.003 6.477 2.003 12c0 1.849.504 3.682 1.463 5.284L2 22l4.833-1.437A9.955 9.955 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.18a8.162 8.162 0 0 1-4.159-1.139l-.298-.177-3.085.917.877-3.019-.193-.31A8.154 8.154 0 0 1 3.82 12c0-4.512 3.669-8.18 8.181-8.18 4.512 0 8.18 3.668 8.18 8.18 0 4.511-3.668 8.18-8.18 8.18zm4.495-6.123c-.246-.123-1.457-.719-1.683-.801-.226-.082-.39-.123-.554.123-.164.246-.636.801-.78.966-.144.164-.287.185-.533.062-1.53-.765-2.536-1.367-3.544-3.1-.268-.46.268-.428.766-1.425.082-.164.041-.308-.021-.43-.062-.124-.554-1.336-.759-1.83-.2-.481-.404-.414-.554-.421h-.472c-.164 0-.43.062-.656.308-.226.245-.863.844-.863 2.058 0 1.214.884 2.387.997 2.551.113.164 1.748 2.668 4.237 3.741.592.256 1.053.41 1.412.525.594.19 1.135.163 1.562.099 1.01-.154 1.498-.632 1.664-1.055.166-.423.166-.785.103-.86-.062-.082-.226-.144-.472-.267z"/>
                  </svg>
                  Book via WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
