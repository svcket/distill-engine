declare global {
  interface Window {
    PaystackPop: {
      setup: (options: PaystackOptions) => {
        openIframe: () => void;
      };
    };
  }
}

export interface PaystackOptions {
  key: string;
  email: string;
  amount: number;
  currency?: string;
  ref?: string;
  metadata?: Record<string, unknown>;
  callback: (response: Record<string, unknown>) => void;
  onClose: () => void;
  plan?: string;
}

export const payWithPaystack = (options: Omit<PaystackOptions, 'key' | 'onClose' | 'callback'>) => {
  if (typeof window === 'undefined' || !window.PaystackPop) {
    console.error('Paystack SDK not loaded');
    return;
  }

  const handler = window.PaystackPop.setup({
    key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
    email: options.email,
    amount: options.amount,
    currency: options.currency || 'NGN',
    ref: options.ref || '' + Math.floor(Math.random() * 1000000000 + 1),
    metadata: options.metadata,
    callback: (response: Record<string, unknown>) => {
      // console.log('Payment successful', response);
      // Refresh the page to pick up the new plan status from the session
      window.location.reload();
    },
    onClose: () => {
      // console.log('Window closed');
    },
  });

  handler.openIframe();
};
