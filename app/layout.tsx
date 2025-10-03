import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/hooks/use-auth";

export const metadata: Metadata = {
  title: "Room Chat",
  description: "Realtime chat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
