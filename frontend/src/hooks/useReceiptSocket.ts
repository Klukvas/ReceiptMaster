import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export interface ReceiptProgressPayload {
  receiptId: string;
  orderId: string;
  progress: number;
  stage: string;
}

export interface ReceiptCompletedPayload {
  receiptId: string;
  orderId: string;
  pdfUrl?: string;
  receiptNumber: string;
}

export interface ReceiptFailedPayload {
  receiptId: string;
  orderId: string;
  error: string;
}

export interface ReceiptSocketCallbacks {
  onProgress?: (payload: ReceiptProgressPayload) => void;
  onCompleted?: (payload: ReceiptCompletedPayload) => void;
  onFailed?: (payload: ReceiptFailedPayload) => void;
}

/**
 * Where the receipts gateway lives.
 *
 * Deployments only ever configure `VITE_API_URL`, so defaulting the socket to a
 * hard-coded `localhost:3000` pointed every production browser at the user's own
 * machine and no receipt event was ever delivered. Follow the API instead: an
 * absolute API URL means the backend is on that origin, a relative one means it
 * is proxied on this origin — and the socket is served from the same place.
 */
export const resolveSocketUrl = (
  wsUrl: string | undefined,
  apiUrl: string | undefined,
  pageOrigin: string,
): string => {
  if (wsUrl) return wsUrl;
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      // A malformed VITE_API_URL must not take the whole app down at import time.
      console.warn(`Unusable VITE_API_URL "${apiUrl}"; using the page origin`);
    }
  }
  return pageOrigin;
};

// Mirrors the fallback in lib/api.ts so dev keeps talking to the local backend.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";
const WS_URL = resolveSocketUrl(
  import.meta.env.VITE_WS_URL,
  API_URL,
  window.location.origin,
);

export const useReceiptSocket = (callbacks?: ReceiptSocketCallbacks) => {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const isFirstConnect = useRef(true);
  const lastInvalidation = useRef(0);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token || !isAuthenticated) return;

    const socket = io(`${WS_URL}/receipts`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // On reconnect (not first connect), invalidate queries to catch missed events
      // but skip if we already invalidated within the last 5 seconds
      if (!isFirstConnect.current) {
        const now = Date.now();
        if (now - lastInvalidation.current > 5000) {
          lastInvalidation.current = now;
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["receipts"] });
        }
      }
      isFirstConnect.current = false;
    });

    socket.on("receipt.progress", (payload: ReceiptProgressPayload) => {
      callbacksRef.current?.onProgress?.(payload);
    });

    socket.on("receipt.completed", (payload: ReceiptCompletedPayload) => {
      callbacksRef.current?.onCompleted?.(payload);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
    });

    socket.on("receipt.failed", (payload: ReceiptFailedPayload) => {
      callbacksRef.current?.onFailed?.(payload);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      isFirstConnect.current = true;
    };
  }, [isAuthenticated, queryClient]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  return { disconnect };
};
