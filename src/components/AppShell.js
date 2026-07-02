"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <div className={`app-container${isLogin ? " app-container-auth" : ""}`}>
      {!isLogin && <Sidebar />}
      <main className={`main-content${isLogin ? " main-content-auth" : ""}`}>
        {children}
      </main>
    </div>
  );
}
