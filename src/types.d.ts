import { EventEmitter } from 'events';

declare module 'events' {
  interface EventEmitter {
    emit(event: string, ...args: any[]): boolean;
  }
}

declare global {
  const describe: (name: string, fn: () => void) => void;
  const it: (name: string, fn: () => void) => void;
  const expect: any;
  const beforeEach: (fn: () => void) => void;
} 