import React, { createContext, useContext, useEffect, useState } from "react";
import {
  initializePaddle,
  type Paddle,
  type Environments,
} from "@paddle/paddle-js";

interface PaddleContextValue {
  paddle: Paddle | null;
  isLoading: boolean;
}

const PaddleContext = createContext<PaddleContextValue>({
  paddle: null,
  isLoading: true,
});

export const usePaddle = () => useContext(PaddleContext);

export const PaddleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    if (!token) {
      setIsLoading(false);
      return;
    }

    const environment = (import.meta.env.VITE_PADDLE_ENVIRONMENT ||
      "sandbox") as Environments;

    initializePaddle({ token, environment })
      .then((paddleInstance) => {
        if (paddleInstance) {
          setPaddle(paddleInstance);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Paddle:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <PaddleContext.Provider value={{ paddle, isLoading }}>
      {children}
    </PaddleContext.Provider>
  );
};
