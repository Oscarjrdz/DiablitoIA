'use client';
import React, { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';
import { Search, MoreVertical, Paperclip, Smile, Mic, Send, Image as ImageIcon, MessageSquare } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorStr: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorStr: error.toString() };
  }
  componentDidCatch(error, info) {
    console.error("Chat Crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: 50, color: 'red', background: '#fff', fontSize: 20}}>
          CRASH EN EL CHAT: {this.state.errorStr}
        </div>;
    }
    return this.props.children;
  }
}

function ChatWebCore() {
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [attachmentBase64, setAttachmentBase64] = useState(null);
  const [attachmentType, setAttachmentType] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Poll chats periodically
  useEffect(() => {
    fetchClients();
    const inv = setInterval(fetchClients, 10000);
    return () => clearInterval(inv);
  }, []);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('loyverse_api_token');
      if (!token) return;
      const res = await fetch('/api/loyverse/clients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        // En un escenario real, los chats vienen de Wapp. Usamos clientes como Chats.
        
        const formatName = (n) => {
           if (!n) return '';
           return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        };

        const chatList = data.data.filter(c => c.phone_number).map(c => {
           let dateStr = 'Reciente';
           if (c.last_visit) {
              const d = new Date(c.last_visit);
              dateStr = d.toLocaleDateString();
           } else if (c.created_at) {
              const d = new Date(c.created_at);
              dateStr = d.toLocaleDateString();
           }
           
           return {
              id: c.phone_number,
              name: formatName(c.name || c.phone_number),
              phone: c.phone_number,
              lastTime: dateStr,
              preview: 'Toca para abrir el chat...',
              tienda: c.tienda || 'No Asig.',
              puntos: Math.floor(c.total_points || c.points_balance || 0),
              visitas: c.total_visits || 0
           };
        });
        setClients(chatList);
        if (!activeChat) setFilteredClients(chatList);
      }
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    let res = clients;
    if (storeFilter) {
       res = res.filter(c => c.tienda === storeFilter);
    }
    if (searchQuery) {
      res = res.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery));
    }
    setFilteredClients(res);
  }, [searchQuery, storeFilter, clients]);

  const loadChatHistory = async (phone) => {
     // Fetch from our new API route to get redis history
     try {
       const res = await fetch(`/api/whatsapp/history?phone=${encodeURIComponent(phone)}`);
       const data = await res.json();
       if (data.success) {
          setMessages(data.messages || []);
       }
     } catch (e) {
       console.error(e);
     }
  };

  const handleChatSelect = (chat) => {
    setActiveChat(chat);
    setMessages([]);
    if (window.activeChatLoader) clearInterval(window.activeChatLoader);
    loadChatHistory(chat.phone);
    // Poll this active chat carefully
    window.activeChatLoader = setInterval(() => loadChatHistory(chat.phone), 4000);
  };

  useEffect(() => {
    return () => {
      if (window.activeChatLoader) clearInterval(window.activeChatLoader);
    };
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
       setAttachmentBase64(ev.target.result);
       if (file.type.startsWith('image/')) setAttachmentType('image');
       else if (file.type.startsWith('audio/')) setAttachmentType('audio');
       else setAttachmentType('document');
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !attachmentBase64) || !activeChat) return;
    
    // Optimistic UI
    const newMsg = { 
       text: inputText, 
       attachment: attachmentBase64,
       attachmentType: attachmentType,
       fromMe: true, 
       time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
    };
    setMessages([...messages, newMsg]);
    
    const bodyStr = JSON.stringify({ 
        to: activeChat.phone, 
        text: inputText, 
        attachment: attachmentBase64,
        attachmentType: attachmentType
    });

    setInputText('');
    setAttachmentBase64(null);
    setAttachmentType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={styles.whatsappWebContainer}>
      
      <div className={styles.leftPane}>
        <div className={styles.paneHeader}>
          <div className={styles.avatar} style={{width: 40, height: 40}}>
             <img src="https://i.postimg.cc/Wb7S1N2S/diablito.png" alt="Profile" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
          </div>
          <div style={{display: 'flex', gap: 15, color: '#54656f'}}>
            <MessageSquare size={20} />
            <MoreVertical size={20} />
          </div>
        </div>
        <div className={styles.searchContainer}>
          <div className={styles.searchInputWrapper}>
             <Search size={16} color="#54656f" />
             <input type="text" placeholder="Busca un chat o inicia uno nuevo" className={styles.searchInput} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div style={{marginTop: 8}}>
             <select style={{width:'100%', padding: '8px 12px', borderRadius: 8, border: 'none', backgroundColor: '#f0f2f5', color: '#54656f', outline: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', appearance: 'none'}} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
                <option value="">Filtro: Todas las sucursales</option>
                {Array.from(new Set(clients.map(c => c.tienda).filter(t => t && t !== 'No Asig.'))).sort().map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
        </div>
        <div className={styles.chatList}>
          {filteredClients.map((chat) => (
            <div key={chat.id} className={`${styles.chatItem} ${activeChat?.id === chat.id ? styles.active : ''}`} onClick={() => handleChatSelect(chat)}>
              <div className={styles.avatar} style={{ overflow: 'hidden' }}>
                 <img src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png" alt="dp" style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8}} />
              </div>
              <div className={styles.chatInfo}>
                <div className={styles.chatNameRow}>
                  <span className={styles.chatName}>{String(chat.name || '')}</span>
                  <span className={styles.chatTime}>{chat.lastTime}</span>
                </div>
                <div style={{fontSize: 12, color: '#667781', display: 'flex', gap: '8px', marginTop: 4, flexWrap: 'wrap'}}>
                  <span style={{background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4}}>🏪 {chat.tienda}</span>
                  <span style={{background: 'rgba(255,165,0,0.1)', color: '#cc8400', padding: '2px 6px', borderRadius: 4}}>⭐ {chat.puntos}</span>
                  <span style={{background: 'rgba(0,128,0,0.1)', color: 'green', padding: '2px 6px', borderRadius: 4}}>🚶 {chat.visitas}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeChat ? (
        <div className={styles.rightPane}>
          <div className={styles.chatHeader}>
              <div className={styles.avatar} style={{ overflow: 'hidden' }}>
                 <img src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png" alt="dp" style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8}} />
              </div>
            <div className={styles.chatHeaderInfo}>
              <span className={styles.chatHeaderName}>{activeChat ? String(activeChat.name) : ''}</span>
              <span className={styles.chatHeaderStatus}>en línea</span>
            </div>
            <div style={{marginLeft: 'auto', display: 'flex', gap: 15, color: '#54656f'}}>
              <Search size={22} />
              <MoreVertical size={22} />
            </div>
          </div>
          
          <div className={styles.messageArea}>
             {Array.isArray(messages) && messages.map((m, idx) => (
                <div key={idx} className={`${styles.messageRow} ${m.fromMe ? styles.out : styles.in}`}>
                   <div className={styles.messageBubble}>
                      {m.attachment && m.attachmentType === 'image' && <img src={m.attachment} style={{maxWidth: '100%', borderRadius: 5, marginBottom: 5}} />}
                      {m.attachment && m.attachmentType !== 'image' && <div style={{background: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 5, fontSize: 12, marginBottom: 5}}>📎 Archivo Adjunto ({m.attachmentType})</div>}
                      <span style={{whiteSpace: 'pre-wrap'}}>{m ? String(m.text || '') : ''}</span>
                      <div className={styles.messageFooter}>
                         <span className={styles.messageTime}>{m.time}</span>
                         {m.fromMe && <span className={styles.messageTick}>✓✓</span>}
                      </div>
                   </div>
                </div>
             ))}
             <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            <button className={styles.iconBtn}><Smile size={24} /></button>
            <button className={styles.iconBtn} onClick={() => fileInputRef.current?.click()}><Paperclip size={22} /></button>
            <input type="file" ref={fileInputRef} style={{display: 'none'}} onChange={handleFileSelect} />
            <div className={styles.inputWrapper}>
              {attachmentBase64 && (
                 <div style={{position: 'absolute', bottom: '60px', left: '70px', background: '#fff', padding: '10px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'}}>
                    {attachmentType === 'image' && <img src={attachmentBase64} style={{maxHeight: 100, borderRadius: 5}} />}
                    {attachmentType !== 'image' && <div>📎 File ready to send</div>}
                    <div style={{textAlign: 'center', cursor: 'pointer', color: 'red', marginTop: 5, fontSize: 12}} onClick={() => setAttachmentBase64(null)}>Quitar</div>
                 </div>
              )}
              <textarea 
                className={styles.messageInput} 
                placeholder="Escribe un mensaje aquí"
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            {inputText.trim() ? (
              <button className={styles.iconBtn} onClick={handleSend}><Send size={24} color="#54656f" style={{marginLeft: 2, transform: 'translateX(2px)'}} /></button>
            ) : (
              <button className={styles.iconBtn}><Mic size={24} /></button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
           <img src="https://logolook.net/wp-content/uploads/2021/07/WhatsApp-Logo.png" style={{height: 100, opacity: 0.3, filter: 'grayscale(100%)', marginBottom: 20}} alt="WhatsApp Web" />
           <h1 className={styles.emptyStateTitle}>WhatsApp Web</h1>
           <p className={styles.emptyStateSubtitle}>
              Envía y recibe mensajes sin conectar tu teléfono.<br/>
              Usa WhatsApp hasta en 4 dispositivos vinculados y 1 teléfono a la vez.
           </p>
        </div>
      )}
    </div>
  );
}

export default function ChatWebPage() {
   return <ErrorBoundary><ChatWebCore /></ErrorBoundary>;
}
