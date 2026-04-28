"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, TrendingUp, Store, Smartphone, Users, Bot, Megaphone, TicketCheck, Receipt } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Clientes', icon: Users, href: '/clients' },
    { label: 'Chat Web', icon: Smartphone, href: '/chat' },
    { label: 'Promociones', icon: Megaphone, href: '/promociones' },
    { label: 'Redimidos', icon: TicketCheck, href: '/redimidos' },
    { label: 'Gastos', icon: Receipt, href: '/gastos' },
    { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
    { label: 'Predictions', icon: TrendingUp, href: '/predictions' },
    { label: 'Bot IA', icon: Bot, href: '/bot' },
    { label: 'Settings', icon: Settings, href: '/settings' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="ios-sidebar">
        <div className="ios-sidebar-logo">
          <Store size={26} color="var(--accent-color)" />
          <span>Diablito 😈</span>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`ios-nav-link ${isActive ? 'active' : ''}`}
              >
                <item.icon size={22} style={isActive ? { strokeWidth: 2.5 } : { strokeWidth: 2 }} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div style={{ marginTop: 'auto', padding: '0 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <p>Loyverse Pro v2.0</p>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav className="ios-bottom-bar">
        {/* Render only the first 5 for the bottom bar so it looks like iOS */}
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`ios-tab-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={24} style={isActive ? { strokeWidth: 2.5 } : { strokeWidth: 2 }} />
              <span>{item.label.substring(0, 5)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
