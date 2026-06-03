'use client';
import React, { useState, useEffect } from 'react';
import { Check, Paperclip } from 'lucide-react';
import { hashColor, initials, relTime } from './_utils';
import styles from './page.module.css';

// ── Avatar con iniciales y color consistente ──
export const Avatar = React.memo(function Avatar({ name = '', phone = '', size = 49, picUrl = null }) {
  const [imgOk, setImgOk] = useState(!!picUrl);
  useEffect(() => setImgOk(!!picUrl), [picUrl]);
  const key = name || phone;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: imgOk ? 'transparent' : hashColor(key),
      flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.37),
      letterSpacing: 0.5, userSelect: 'none', position: 'relative'
    }}>
      {picUrl && imgOk
        ? <img src={picUrl} alt="" onError={() => setImgOk(false)} loading="lazy" decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : initials(name || phone.slice(-4))
      }
    </div>
  );
});

// ── Ticks de estado del mensaje ──
export const Ticks = React.memo(function Ticks({ status }) {
  if (!status) return null;
  if (status === 'sent') return <Check size={14} color="#8696a0" strokeWidth={2.5} />;
  const color = status === 'read' ? '#53bdeb' : '#8696a0';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path d="M1 5.5L4.5 9L10 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 5.5L9.5 9L15 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
});

// ── Animación de tres puntos (typing) ──
export const TypingDots = React.memo(function TypingDots() {
  return (
    <span className={styles.typingDots}>
      <span /><span /><span />
    </span>
  );
});

// ── Fila de chat en la lista ──
export const ChatRow = React.memo(function ChatRow({ chat, isActive, picUrl, onOpen, onToggleRead, onDelete }) {
  return (
    <div
      className={`${styles.chatItem} ${isActive ? styles.chatActive : ''}`}
      onClick={() => onOpen(chat)}
    >
      <div className={styles.avatarWrap}>
        <div className={chat.deliveryMode ? styles.deliveryRing : undefined}>
          <Avatar name={chat.name} phone={chat.phone} size={49} picUrl={picUrl} />
        </div>
        {chat.unread > 0 && <span className={styles.avatarBadge}>{chat.unread > 99 ? '99+' : chat.unread}</span>}
      </div>
      <div className={styles.chatMeta}>
        <div className={styles.chatRow1}>
          <span className={styles.chatName}>{chat.name}</span>
          <span className={chat.unread > 0 ? styles.chatTimeUnread : styles.chatTime}>
              {relTime(chat.lastTs)}
          </span>
        </div>
        <div className={styles.chatRow2}>
          <span className={styles.chatPreview}>
            {chat.fromMe && <Ticks status="delivered" />}
            {chat.fromMe && ' '}
            {chat.lastText || <em style={{ opacity: 0.4 }}>Sin mensajes</em>}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {chat.botSilent && <span className={styles.botSilentBadge} title="Bot silenciado">🤖💤</span>}
          </div>
        </div>
      </div>
      <div className={styles.chatActionBtns}>
        <button
          className={styles.chatMarkBtn}
          onClick={e => { e.stopPropagation(); onToggleRead(chat.phone, chat.needsHuman); }}
          title={chat.needsHuman ? 'Marcar como leído' : 'Marcar como no leído'}
        >
          {chat.needsHuman ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>
        <button
          className={styles.chatDeleteBtn}
          onClick={e => { e.stopPropagation(); onDelete(chat); }}
          title="Eliminar chat"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.chat === next.chat &&
  prev.isActive === next.isActive &&
  prev.picUrl === next.picUrl
);

// ── Burbuja de mensaje ──
export const MessageBubble = React.memo(function MessageBubble({ m, chatName, chatPhone, picUrl }) {
  return (
    <div className={m.fromMe ? styles.rowOut : styles.rowIn}>
      {!m.fromMe && <Avatar name={chatName} phone={chatPhone} size={28} picUrl={picUrl} />}
      <div className={m.fromMe ? styles.bubbleOut : styles.bubbleIn}>
        {m.attachment && m.attachmentType === 'image' && (
          <img src={m.attachment} alt="" decoding="async" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block', marginBottom: 4 }} />
        )}
        {!m.attachment && m.attachmentUrl && m.attachmentType === 'image' && (
          <img src={m.attachmentUrl} alt="" loading="lazy" decoding="async" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block', marginBottom: 4 }} />
        )}
        {m.attachmentType === 'sticker' && m.attachmentUrl && (
          <img src={m.attachmentUrl} alt="Sticker" loading="lazy" decoding="async" style={{ maxWidth: 160, borderRadius: 4, display: 'block', marginBottom: 2 }} />
        )}
        {m.hasAttachment && !m.attachmentUrl && !m.attachment && m.attachmentType !== 'sticker' && (
          <div className={styles.fileAttach}>
            <Paperclip size={14} />
            <span>{m.attachmentType === 'audio' ? '🎙 Audio' : 'Archivo adjunto'}</span>
          </div>
        )}
        {m.text && <span className={styles.msgText}>{m.text}</span>}
        <div className={styles.msgMeta}>
          {m.time && <span className={styles.msgTime}>{m.time}</span>}
          {m.fromMe && <Ticks status={m.status} />}
          {m.status === 'error' && (
            <span title="Error al enviar" style={{ color: '#ef4444', fontSize: 12, marginLeft: 2 }}>⚠️</span>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.m.msgId === next.m.msgId &&
  prev.m.status === next.m.status &&
  prev.m.text === next.m.text &&
  prev.m.attachmentUrl === next.m.attachmentUrl &&
  prev.picUrl === next.picUrl
);

// ── Tarjeta de producto POS ──
export const PosProductCard = React.memo(function PosProductCard({ item, totalInCart, posStoreId, onOpen }) {
  const hasMulti = item.variants?.length > 1;
  const firstVariant = item.variants?.[0];
  let price = firstVariant?.default_price || 0;
  if (posStoreId && firstVariant?.stores) {
    const sp = firstVariant.stores.find(s => s.store_id === posStoreId)?.price;
    if (sp != null) price = sp;
  }
  return (
    <div
      className={`${styles.posProductCard} ${totalInCart > 0 ? styles.posProductInCart : ''}`}
      onClick={() => onOpen(item, firstVariant, hasMulti)}
      title={item.item_name}
    >
      {item.image_url ? (
        <img src={item.image_url} alt="" loading="lazy" decoding="async" className={styles.posProductImg} />
      ) : (
        <div className={styles.posProductPlaceholder}>{item.item_name.charAt(0).toUpperCase()}</div>
      )}
      <div className={styles.posProductName}>{item.item_name}</div>
      <div className={styles.posProductPrice}>
        {hasMulti ? 'Ver variantes' : `$${price.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
      </div>
      {totalInCart > 0 && <div className={styles.posProductQtyBadge}>{totalInCart}</div>}
    </div>
  );
}, (prev, next) =>
  prev.totalInCart === next.totalInCart &&
  prev.posStoreId === next.posStoreId &&
  prev.item === next.item
);
