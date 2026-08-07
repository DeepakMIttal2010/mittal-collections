export const toWhatsAppNumber = (phone) => {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;

  return digits;
};
