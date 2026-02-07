"use client";
import "./globals.css";
import React from "react";
import { QueryProvider } from "@/providers/query-provider";
import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased relative`}>
        <Toaster />
        <QueryProvider>
          <div className="flex">
            <Sidebar className="w-1/4" />
            <div className="flex-1 flex flex-col">
              <Navbar className="w-full" />
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
