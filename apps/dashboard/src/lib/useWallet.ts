"use client";

/**
 * Wallet state hook wrapping @stellar/freighter-api (exports verified
 * against v6.0.1: getAddress, getNetwork, isConnected, signTransaction…).
 * Freighter only exists in the browser, so everything is effect-gated.
 */

import { useCallback, useEffect, useState } from "react";

export interface WalletState {
  /** True once we know whether the extension is present (avoids SSR flicker). */
  ready: boolean;
  connected: boolean;
  address: string | null;
  network: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { isConnected, getAddress, getNetwork } = await import("@stellar/freighter-api");
        if (await isConnected()) {
          const { address: addr } = await getAddress();
          const { network: net } = await getNetwork();
          if (!cancelled) {
            setAddress(addr);
            setNetwork(net);
            setConnected(true);
          }
        }
      } catch {
        // Extension absent or unreachable — stay disconnected.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { getAddress, getNetwork } = await import("@stellar/freighter-api");
      const { address: addr } = await getAddress();
      const { network: net } = await getNetwork();
      setAddress(addr);
      setNetwork(net);
      setConnected(true);
    } catch (err) {
      setError(
        err instanceof Error && /user|reject/i.test(err.message)
          ? "Connection request was declined"
          : "Freighter extension not found — install it from freighter.app",
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setNetwork(null);
    setConnected(false);
  }, []);

  return { ready, connected, address, network, connecting, error, connect, disconnect };
}
