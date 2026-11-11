import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArenaConfig,
  ArenaSnapshot,
  ArenaTick,
  NewsItem,
  OrderRequest,
  ServerMessage,
  StrategyInfo,
  TradeRow,
} from '../shared/types';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

function mergeTick(prev: ArenaSnapshot, tick: ArenaTick): ArenaSnapshot {
  const byId = new Map(tick.instruments.map((i) => [i.id, i]));
  const instruments = prev.instruments.map((old) => {
    const next = byId.get(old.id);
    if (!next) return old;
    const history = [...old.history, next.mid];
    if (history.length > 360) history.splice(0, history.length - 360);
    return { ...old, ...next, history };
  });

  const tradeIds = new Set(prev.trades.map((t) => t.id));
  const freshTrades: TradeRow[] = tick.trades.filter((t) => !tradeIds.has(t.id)).reverse();
  const trades = [...freshTrades, ...prev.trades].slice(0, 100);

  const newsIds = new Set(prev.news.map((n) => n.id));
  const freshNews: NewsItem[] = tick.news.filter((n) => !newsIds.has(n.id)).reverse();
  const news = [...freshNews, ...prev.news].slice(0, 60);

  const equity = [...prev.equity, tick.equityPoint].slice(-300);

  return {
    ...prev,
    seq: tick.seq,
    ts: tick.ts,
    instruments,
    positions: tick.positions,
    orders: tick.orders,
    trades,
    news,
    strategies: tick.strategies,
    stats: tick.stats,
    equity,
  };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export function useArena() {
  const [state, setState] = useState<ArenaSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [latency, setLatency] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const pingSent = useRef(0);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus((prev) => (prev === 'live' ? 'reconnecting' : 'connecting'));
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        reconnectRef.current = 0;
        setStatus('live');
        pingSent.current = performance.now();
        ws.send(JSON.stringify({ type: 'ping' }));
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === 'pong') {
          setLatency(Math.max(0, Math.round(performance.now() - pingSent.current)));
          return;
        }
        if (message.type === 'reset') {
          ws.send(JSON.stringify({ type: 'snapshot' }));
          return;
        }
        if (message.type === 'snapshot') {
          setState(message);
          setStatus('live');
          return;
        }
        if (message.type === 'tick') {
          setState((prev) => {
            if (!prev) {
              ws.send(JSON.stringify({ type: 'snapshot' }));
              return prev;
            }
            return mergeTick(prev, message);
          });
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus('reconnecting');
        const attempt = reconnectRef.current++;
        const delay = Math.min(6000, 600 * 2 ** attempt);
        retryTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    const ping = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        pingSent.current = performance.now();
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 10_000);

    return () => {
      disposed = true;
      window.clearInterval(ping);
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
      setStatus('offline');
    };
  }, []);

  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }, []);

  const placeOrder = useCallback(
    async (input: OrderRequest) => {
      try {
        const result = await request<{ ok: boolean; filled?: number; avgPrice?: number }>('/api/order', input);
        toast(
          result.filled
            ? `${input.side === 'buy' ? 'Bought' : 'Sold'} ${result.filled} ${input.instrument} @ ${result.avgPrice?.toFixed(2) ?? 'mkt'}`
            : `Order working · ${input.side} ${input.qty} ${input.instrument}`,
          'success',
        );
        return result;
      } catch (error) {
        toast(readErrorMessage(error), 'error');
        throw error;
      }
    },
    [request, toast],
  );

  const cancelOrder = useCallback(
    async (id: string) => {
      try {
        await request('/api/cancel', { id });
        toast('Order cancelled', 'info');
      } catch (error) {
        toast(readErrorMessage(error), 'error');
      }
    },
    [request, toast],
  );

  const cancelAll = useCallback(async () => {
    try {
      const result = await request<{ cancelled: number }>('/api/cancel', { all: true });
      toast(`Cancelled ${result.cancelled} manual order${result.cancelled === 1 ? '' : 's'}`, 'info');
    } catch (error) {
      toast(readErrorMessage(error), 'error');
    }
  }, [request, toast]);

  const setStrategy = useCallback(
    async (id: string, enabled: boolean) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          strategies: prev.strategies.map((s) => (s.id === id ? { ...s, enabled } : s)),
        };
      });
      try {
        await request('/api/strategy', { id, enabled });
        toast(`${enabled ? 'Started' : 'Paused'} ${id}`, enabled ? 'success' : 'info');
      } catch (error) {
        toast(readErrorMessage(error), 'error');
        const fresh = await request<ArenaSnapshot>('/api/state').catch(() => null);
        if (fresh) setState(fresh);
      }
    },
    [request, toast],
  );

  const saveStrategyConfig = useCallback(
    async (id: string, config: Record<string, number>) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          strategies: prev.strategies.map((s) => (s.id === id ? { ...s, config: { ...s.config, ...config } } : s)),
        };
      });
      try {
        await request('/api/strategy', { id, config });
        toast(`Saved ${id} parameters`, 'success');
      } catch (error) {
        toast(readErrorMessage(error), 'error');
      }
    },
    [request, toast],
  );

  const setConfig = useCallback(
    async (config: Partial<ArenaConfig>) => {
      try {
        await request('/api/config', config);
        setState((prev) => (prev ? { ...prev, config: { ...prev.config, ...config } } : prev));
      } catch (error) {
        toast(readErrorMessage(error), 'error');
      }
    },
    [request, toast],
  );

  const publishNews = useCallback(
    async (text: string, sentiment?: number, tickers?: string[]) => {
      try {
        await request<{ item: NewsItem }>('/api/news', { text, sentiment, tickers });
        toast('Headline published to the wire', 'success');
      } catch (error) {
        toast(readErrorMessage(error), 'error');
        throw error;
      }
    },
    [request, toast],
  );

  const reset = useCallback(async () => {
    try {
      await request('/api/reset', {});
      toast('Arena reset · fresh session', 'info');
    } catch (error) {
      toast(readErrorMessage(error), 'error');
    }
  }, [request, toast]);

  return {
    state,
    status,
    latency,
    toasts,
    toast,
    dismissToast,
    actions: { placeOrder, cancelOrder, cancelAll, setStrategy, saveStrategyConfig, setConfig, publishNews, reset },
  };
}

export type ArenaActions = ReturnType<typeof useArena>['actions'];
export type StrategyUpdater = (id: string, enabled: boolean) => Promise<void>;
export type StrategyInfoMap = Record<string, StrategyInfo>;
