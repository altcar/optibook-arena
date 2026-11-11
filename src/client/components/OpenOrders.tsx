import { useState } from 'react';
import { STRATEGY_META, type OrderRow } from '../../shared/types';
import { fmtPrice, fmtQty, fmtTime } from '../format';
import { Icon } from './Icons';

const BOOK_LABELS: Record<string, string> = Object.fromEntries(
  STRATEGY_META.map((s) => [s.id, s.short]),
);

export function OpenOrders({
  orders,
  onCancel,
  onCancelAll,
}: {
  orders: OrderRow[];
  onCancel: (id: string) => void;
  onCancelAll: () => void;
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const filtered = orders.filter((order) => scope === 'all' || order.strategy === 'manual');
  const manualCount = orders.filter((order) => order.strategy === 'manual').length;

  return (
    <section className="panel orders-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Working orders</h2>
          <p className="panel-sub">{manualCount} manual · {orders.length} total</p>
        </div>
        <div className="segmented small">
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>
            Mine
          </button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
            All
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name="activity" size={18} />
          <span>No working {scope === 'mine' ? 'manual ' : ''}orders.</span>
        </div>
      ) : (
        <div className="order-list">
          {filtered.map((order) => (
            <div key={order.id} className="order-row">
              <span className={`order-side ${order.side}`}>{order.side === 'buy' ? 'B' : 'S'}</span>
              <div className="order-main">
                <div className="order-line">
                  <span className="mono">{order.instrument}</span>
                  <span className="mono order-price">{fmtPrice(order.price)}</span>
                </div>
                <div className="order-line muted small">
                  <span>{fmtQty(order.filled)} / {fmtQty(order.qty)} filled</span>
                  <span>{fmtTime(order.ts)}</span>
                </div>
              </div>
              <span className="order-book-tag">
                {order.strategy === 'manual' ? 'You' : BOOK_LABELS[order.strategy] ?? order.strategy}
              </span>
              {order.strategy === 'manual' && (
                <button className="icon-btn danger" onClick={() => onCancel(order.id)} title="Cancel order">
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {manualCount > 0 && (
        <button className="cancel-all" onClick={onCancelAll}>
          Cancel all manual orders
        </button>
      )}
    </section>
  );
}
