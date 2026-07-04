'use strict';

function normalizePhone(raw) {
  const str = String(raw || '');
  const digits = str.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return str.startsWith('+') ? str : (digits ? '+' + digits : str);
}

module.exports = { normalizePhone };
