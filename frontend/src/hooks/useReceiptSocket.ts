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

const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:3000";

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
