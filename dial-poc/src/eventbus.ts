import { EventEmitter } from 'node:events';

export type DialEvent =
  | { type: 'registry.changed'; name: string; op: 'register' | 'renew' | 'transfer' | 'release' }
  | { type: 'resolver.changed'; name: string; key: string; value: string }
  | { type: 'billing.paid'; name: string; payment_id: string };

class Bus extends EventEmitter {
  publish(evt: DialEvent) {
    this.emit('dial', evt);
  }
  subscribe(handler: (evt: DialEvent) => void) {
    this.on('dial', handler);
  }
}

export const bus = new Bus();
