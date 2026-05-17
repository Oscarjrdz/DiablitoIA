"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, TrendingUp, Store, Smartphone, Users, Bot, Megaphone, TicketCheck, Receipt, ShoppingBag, PanelLeftClose, PanelLeftOpen, Copy } from 'lucide-react';

const EXPANDED_WIDTH = 250;
const COLLAPSED_WIDTH = 64;

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    const isCollapsed = stored === 'true';
    setCollapsed(isCollapsed);
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.style.setProperty('--sidebar-width', next ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`);
    localStorage.setItem('sidebarCollapsed', next ? 'true' : 'false');
  };

  const navItems = [
    { label: 'Clientes', icon: Users, href: '/clients' },
    { label: 'Chat Web', icon: Smartphone, href: '/chat' },
    { label: 'Promociones', icon: Megaphone, href: '/promociones' },
    { label: 'Redimidos', icon: TicketCheck, href: '/redimidos' },
    { label: 'Gastos', icon: Receipt, href: '/gastos' },
    { label: 'Catálogo', icon: ShoppingBag, href: '/catalogo' },
    { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
    { label: 'Predictions', icon: TrendingUp, href: '/predictions' },
    { label: 'Bot IA', icon: Bot, href: '/bot' },
    { label: 'Duplicados', icon: Copy, href: '/duplicados' },
    { label: 'Settings', icon: Settings, href: '/settings' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`ios-sidebar${collapsed ? ' ios-sidebar-collapsed' : ''}`}>

        {/* Logo + toggle */}
        <div className="ios-sidebar-logo">
          {!collapsed && <Store size={26} color="var(--accent-color)" style={{ flexShrink: 0 }} />}
          {!collapsed && <span>Diablito 😈</span>}
          <button
            onClick={toggle}
            className="ios-sidebar-toggle"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            style={{ marginLeft: collapsed ? 0 : 'auto' }}
          >
            {collapsed
              ? <PanelLeftOpen size={18} />
              : <PanelLeftClose size={18} />
            }
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ios-nav-link${isActive ? ' active' : ''}${collapsed ? ' ios-nav-link-collapsed' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={22} style={isActive ? { strokeWidth: 2.5, flexShrink: 0 } : { strokeWidth: 2, flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div style={{ padding: '0 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <p>Loyverse Pro v2.0</p>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav className="ios-bottom-bar">
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
