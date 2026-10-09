"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { ThemeProvider } from "@ostiary/core/components/theme-provider";
import { Toaster } from "@ostiary/core/components/ui/sonner";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

/** `nonce`: the page's CSP nonce, for the theme script next-themes renders inline. */
export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      nonce={nonce}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <ThemedToaster />
    </ThemeProvider>
  );
}
