import { formatRubAmount } from '@/lib/yookassa';

export interface ReceiptCustomer {
  email?: string;
  phone?: string;
  full_name?: string;
}

export interface BuildReceiptInput {
  planTitle: string;
  amountRub: number;
  customer: ReceiptCustomer;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

function getVatCode(): number {
  const raw = process.env.YOOKASSA_VAT_CODE;
  if (!raw) return 1;
  const code = Number(raw);
  return Number.isFinite(code) ? code : 1;
}

export function buildSubscriptionReceipt(input: BuildReceiptInput) {
  const amountValue = formatRubAmount(input.amountRub);
  const customer: Record<string, string> = {};

  if (input.customer.email) {
    customer.email = input.customer.email;
  }
  if (input.customer.phone) {
    customer.phone = normalizePhone(input.customer.phone);
  }
  if (input.customer.full_name) {
    customer.full_name = input.customer.full_name;
  }

  if (!customer.email && !customer.phone) {
    throw new Error('Для чека нужен email или телефон пользователя');
  }

  const receipt: Record<string, unknown> = {
    customer,
    items: [
      {
        description: `Подписка «${input.planTitle}»`,
        quantity: 1,
        amount: {
          value: amountValue,
          currency: 'RUB',
        },
        vat_code: getVatCode(),
        payment_mode: 'full_payment',
        payment_subject: 'service',
        measure: 'piece',
      },
    ],
    internet: true,
  };

  const taxSystemCode = process.env.YOOKASSA_TAX_SYSTEM_CODE;
  if (taxSystemCode) {
    receipt.tax_system_code = Number(taxSystemCode);
  }

  return receipt;
}
