"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, TrendingUp, Smartphone, Users, Bot, Megaphone, TicketCheck, Receipt, ShoppingBag, PanelLeftClose, PanelLeftOpen, Copy, LogOut } from 'lucide-react';

const EXPANDED_WIDTH = 250;
const COLLAPSED_WIDTH = 64;

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [user, setUser] = useState(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? `${COLLAPSED_WIDTH}px` : `${EXPANDED_WIDTH}px`);
    localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false');
  }, [collapsed]);

  useEffect(() => {
    let active = true;

    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const toggle = () => {
    setCollapsed((value) => !value);
  };

  const navItems = useMemo(() => [
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
  ], []);

  const visibleNavItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'order_taker') return navItems.filter((item) => item.href === '/chat');
    return navItems;
  }, [navItems, user]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`ios-sidebar${collapsed ? ' ios-sidebar-collapsed' : ''}`}>

        {/* Logo + toggle */}
        <div className="ios-sidebar-logo">
          {!collapsed && <span>El Diablito 😈</span>}
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
          {visibleNavItems.map((item) => {
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
          <div className="ios-sidebar-footer">
            <div>
              <strong>{user?.name || 'El Diablito'}</strong>
              <span>{user?.role === 'order_taker' ? 'Tomador de pedidos' : 'Super admin'}</span>
            </div>
            <button type="button" onClick={handleLogout} title="Cerrar sesion">
              <LogOut size={18} />
              <span>Cerrar</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <nav className="ios-bottom-bar">
        {visibleNavItems.slice(0, 5).map((item) => {
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
